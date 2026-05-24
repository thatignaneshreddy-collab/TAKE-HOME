# Allo Care Inventory Reservation System

A production-grade inventory reservation system built with Next.js App Router, PostgreSQL, and Prisma. The entire architecture revolves around one non-negotiable requirement: **if two requests arrive simultaneously for the last unit of inventory, exactly one succeeds and the other receives 409**.

---

## Architecture Overview

### Why This Design

The system is built around a single engineering insight: **inventory availability is a consistency problem, not a read problem**. Most systems fail because they treat "check availability → reserve" as two separate operations. Under concurrency, any time gap between read and write is a race window.

The solution is to collapse check-and-reserve into a single atomic database operation.

### Technology Choices

| Choice | Reasoning |
|--------|-----------|
| PostgreSQL | Row-level locking gives us serializable atomic updates without distributed infrastructure |
| Prisma | Type-safe ORM with `$executeRaw` escape hatch for the critical atomic UPDATE |
| Next.js Route Handlers | Stateless API — each request is independent, no in-process shared state to corrupt |
| React Query | Polling + cache invalidation without `window.location.reload()` |
| Optional Redis | High-volume rate limiting and short-lived hot read caching; PostgreSQL remains the source of truth |
| No setTimeout | Reservation expiry is never managed in-memory. It's purely database-driven |

---

## Concurrency Explanation

### Why the Naive Approach Fails

```typescript
// WRONG — do not do this
const inventory = await prisma.inventory.findUnique(...)
if (inventory.totalStock - inventory.reservedStock >= qty) {
  await prisma.inventory.update({ data: { reservedStock: { increment: qty } } })
}
```

Under concurrent load:
1. Request A reads: totalStock=10, reservedStock=9, available=1 ✓
2. Request B reads: totalStock=10, reservedStock=9, available=1 ✓  
3. Request A writes: reservedStock=10
4. Request B writes: reservedStock=11 ← **oversold**

Both requests passed the check before either write committed. This is a classic TOCTOU (time-of-check-time-of-use) race condition.

### The Correct Approach: Atomic Conditional UPDATE

```sql
UPDATE "Inventory"
SET "reservedStock" = "reservedStock" + :qty,
    "updatedAt" = NOW()
WHERE "productId" = :productId
  AND "warehouseId" = :warehouseId
  AND ("totalStock" - "reservedStock") >= :qty
```

PostgreSQL evaluates the WHERE clause **atomically under row-level lock**:

1. Request A acquires row lock
2. Request A evaluates WHERE: (10 - 9) >= 1 → true
3. Request A increments reservedStock to 10, releases lock
4. Request B acquires lock
5. Request B evaluates WHERE: (10 - 10) >= 1 → **false**
6. Request B sees 0 rows affected → returns 409

The `$executeRaw` return value (affected row count) is the authoritative signal. **1 = success, 0 = insufficient stock.**

This pattern is:
- Atomic (no window between check and write)
- Race-safe (row lock prevents concurrent evaluation)
- Scalable (no application-level distributed locking needed)
- Simple (one SQL statement, no saga patterns)

### State Machine

```
                ┌─────────────────────────────────────┐
                │           RESERVATION                │
                │                                      │
    create ──→  │  pending  ──confirm──→  confirmed   │
                │     │                  (terminal)    │
                │   release                            │
                │     │                               │
                │     ↓                               │
                │  released  (terminal)               │
                │                                     │
                │  [expiresAt < now] = expired,       │
                │  treated as release during cleanup  │
                └─────────────────────────────────────┘
```

**Only `pending` → `confirmed` and `pending` → `released` transitions are valid.** Confirmed reservations cannot be released (that would require a separate "return" flow). The `WHERE status = 'pending'` clause on all state transitions is a critical guard — it prevents double-confirm, double-release, and confirm-after-release in a single atomic check.

---

## Inventory State Rules

```
availableStock = totalStock - reservedStock   (COMPUTED, NEVER STORED)

On reservation creation:
  reservedStock += quantity        (soft hold)
  totalStock unchanged

On reservation confirmation:
  totalStock -= quantity           (permanent deduction)
  reservedStock -= quantity        (release the hold)
  net effect: available unchanged, total decremented

On reservation release:
  reservedStock -= quantity        (release the hold)
  totalStock unchanged             (stock returns to available pool)
```

This model means `totalStock` always represents "units physically in the system" and `reservedStock` represents "units currently spoken for but not yet confirmed."

---

## Expiry Mechanism

### Why No In-Memory Timers

`setTimeout`-based expiry is fundamentally broken:
- Process restarts lose all pending timers
- Serverless environments (Vercel) don't maintain persistent processes
- Timer drift under load leads to inconsistent cleanup
- No persistence means reservations live forever after a crash

### Two-Layer Cleanup Strategy

**Layer 1: Lazy Cleanup (before hot operations)**

Before `createReservation` and `getProducts`, we run:

```sql
SELECT id, productId, warehouseId, quantity
FROM "Reservation"
WHERE status = 'pending' AND "expiresAt" < NOW()
FOR UPDATE SKIP LOCKED
```

`SKIP LOCKED` is critical — if another cleanup is already running, we skip rows it's processing rather than blocking. This prevents cleanup storms.

The cleanup runs **inside the calling transaction**, so expired stock is freed before availability is evaluated. This prevents starvation: a product with 0 available but 5 expired pending reservations will correctly show 5 available to new requests.

**Layer 2: Cron Cleanup (belt-and-suspenders)**

`GET /api/cleanup` runs every 5 minutes via Vercel Cron. This catches expired reservations for products that weren't accessed during their expiry window.

### Expiry Race Conditions

What if a user tries to confirm a reservation that's expiring right now?

```typescript
// confirm handler
const reservations = await tx.$queryRaw`
  SELECT ... FROM "Reservation" WHERE id = ${id}
  FOR UPDATE   ← acquires exclusive row lock
`

// cron cleanup
SELECT ... WHERE status = 'pending' AND expiresAt < NOW()
FOR UPDATE SKIP LOCKED   ← SKIPS the locked row
```

The `FOR UPDATE` lock on the confirm path prevents the cleanup from touching the row simultaneously. One of these will win:
- If confirm acquires the lock first: confirms successfully (if not yet past expiresAt), cleanup skips it
- If cleanup acquires the lock first: marks as released, confirm sees status='released' → returns 409

There is no scenario where both operations complete simultaneously on the same row.

---

## Edge Cases

### Double Confirm

```
Request A: POST /confirm → acquires lock → transitions to confirmed
Request B: POST /confirm → acquires lock → sees status='confirmed' → 409
```

The `WHERE status = 'pending'` in the Prisma update call plus the explicit status check on the fetched row makes this safe.

### Double Release

Same pattern: the second release sees `status='released'` → 409.

### Confirm After Expiry

Confirm logic checks `expiresAt` **after** acquiring the row lock. If expired, it:
1. Releases the reserved stock (since cleanup may not have run yet)
2. Marks the reservation as released
3. Returns 410 to the client

### Retry Behavior (Idempotency)

Clients can supply `Idempotency-Key: <unique-key>` on reservation creation and confirmation. The first call executes the operation and stores the response. Subsequent calls with the same key return the stored response without re-executing.

The response is stored alongside a hash of `(method, path, body)`. If a client reuses a key with different body content, they get 422 — this is a client bug, not a server retry.

### Partial Transaction Failures

All inventory mutations (reservation creation, confirmation, release) are wrapped in `prisma.$transaction()`. If any step fails, the entire transaction rolls back. The database CHECK constraints (`reservedStock <= totalStock`, `reservedStock >= 0`) are the final line of defense against corrupted state reaching disk.

### Simultaneous Cancellation Requests

Two simultaneous releases: one acquires the `FOR UPDATE` lock, completes, marks status='released'. The second acquires the lock, sees status='released', returns 409. No double-decrement of `reservedStock`.

---

## Tradeoffs

### PostgreSQL Atomic Updates + Optional Redis

**Chose PostgreSQL atomic updates for correctness, with Redis as an optional high-volume support layer.**

Redis locking (Redlock) adds significant complexity: clock drift, network partitions, lock expiry during long transactions, and a second infrastructure dependency. For this problem, PostgreSQL row-level locking gives us the same serialization guarantee with zero additional infrastructure.

For high-volume deployments, Redis is useful around the critical path rather than inside it:

- `POST /api/reservations` uses Redis-backed rate limiting when Redis env vars are present.
- `GET /api/products` uses a 5-second Redis cache for hot inventory reads.
- Reservation create/confirm/release and cron cleanup invalidate the cached product inventory.

PostgreSQL still owns every inventory mutation and enforces the no-oversell guarantee.

### Lazy + Cron Expiry vs Event-Driven Expiry

**Chose lazy + cron.**

Event-driven expiry (pg_cron, Redis TTL events, scheduled Lambda) gives faster cleanup but adds complexity. The lazy cleanup ensures stock is freed before the next reservation attempt regardless of when cron last ran — which is actually more important for user experience than millisecond-accurate cleanup.

The tradeoff: reservations might show as `pending` in the UI for up to 5 minutes after they expire, if no relevant operation triggers lazy cleanup. Acceptable for this use case.

### `SKIP LOCKED` vs Sequential Cleanup

**Chose `SKIP LOCKED`.**

`SKIP LOCKED` prevents cleanup operations from blocking each other and prevents deadlocks when cleanup races with confirm/release. The tradeoff is that some rows might be skipped in a given cleanup cycle — but they'll be caught in the next cycle.

### No `availableStock` Column

**Chose computed availability.**

Storing `availableStock` as a column means every mutation must update three fields atomically, and it's easy to drift. Computing `totalStock - reservedStock` at read time is always correct by definition. The only downside is that queries can't use an index on `availableStock` — acceptable given our query patterns.

---

## Data Model

```
Product ──< Inventory >── Warehouse
   |
   └──< Reservation >── Warehouse

Inventory: UNIQUE(productId, warehouseId)
  totalStock    — units physically in system
  reservedStock — units in pending reservations
  available     = totalStock - reservedStock (computed)

Reservation status machine:
  pending → confirmed (permanent stock deduction)
  pending → released  (stock freed)
```

---

## Local Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ (or Neon/Supabase account)

### 1. Clone and install

```bash
git clone <repo>
cd inventory-system
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL
```

For **Neon**: `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`  
For **Supabase**: `postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres`

### 3. Database setup

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database (dev)
npm run db:push

# Apply CHECK constraints migration
psql $DATABASE_URL < prisma/migrations/0001_constraints.sql

# Seed realistic demo data
npm run db:seed
```

### 4. Run development server

```bash
npm run dev
# Visit http://localhost:3000
```

### Deployment (Vercel + Neon)

1. Create Neon database at https://console.neon.tech
2. Connect Vercel project to repository
3. Add environment variables in Vercel dashboard:
   - `DATABASE_URL` — Neon connection string
   - `CRON_SECRET` — random secret (`openssl rand -hex 32`)
   - `UPSTASH_REDIS_REST_URL` - optional Upstash Redis REST URL
   - `UPSTASH_REDIS_REST_TOKEN` - optional Upstash Redis REST token
4. Vercel automatically runs `vercel.json` cron every 5 minutes

```bash
# Manual deploy
vercel --prod
```

---

## Testing Concurrency

### Manual race condition test

```bash
# Reserve the last unit from two concurrent requests
# (Fertility Assessment Kit @ East India Hub has 1 unit after seeding)
PRODUCT_ID="<id>"
WAREHOUSE_ID="<east-id>"

curl -X POST http://localhost:3000/api/reservations \
  -H "Content-Type: application/json" \
  -d "{\"productId\":\"$PRODUCT_ID\",\"warehouseId\":\"$WAREHOUSE_ID\",\"quantity\":1}" &

curl -X POST http://localhost:3000/api/reservations \
  -H "Content-Type: application/json" \
  -d "{\"productId\":\"$PRODUCT_ID\",\"warehouseId\":\"$WAREHOUSE_ID\",\"quantity\":1}" &

wait
```

One request returns 201, the other 409. The inventory row will show `reservedStock=1`, `totalStock=1`, available=0.

### Idempotency test

```bash
KEY="test-key-$(date +%s)"

# First call — executes
curl -X POST http://localhost:3000/api/reservations \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $KEY" \
  -d "{...}"

# Second call — returns same response, no side effect
curl -X POST http://localhost:3000/api/reservations \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $KEY" \
  -d "{...}"
# Response includes header: Idempotent-Replayed: true
```

---

## Commit Plan

```
feat: initial project scaffolding (Next.js, Prisma, TypeScript)
feat: data model — Product, Warehouse, Inventory, Reservation schema
feat: db constraints — CHECK constraints + partial indexes via raw SQL
feat: inventory service — atomic conditional UPDATE for race-safe reservations
feat: expiry system — lazy cleanup + FOR UPDATE SKIP LOCKED
feat: reservation state machine — confirm/release with row locking
feat: idempotency — key-based request deduplication
feat: api routes — products, warehouses, reservations CRUD
feat: frontend — products page with inventory table
feat: frontend — reservation detail page with countdown timer
feat: seed — multi-product multi-warehouse realistic demo data
feat: cron — cleanup endpoint + vercel.json schedule
docs: README with architecture, concurrency reasoning, setup guide
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/products` | Products with inventory by warehouse |
| GET | `/api/warehouses` | All warehouses |
| POST | `/api/reservations` | Create reservation (409 if insufficient stock) |
| GET | `/api/reservations/:id` | Get reservation details |
| POST | `/api/reservations/:id/confirm` | Confirm pending reservation (410 if expired) |
| POST | `/api/reservations/:id/release` | Release pending reservation |
| GET | `/api/cleanup` | Run expired reservation cleanup (cron) |

All mutation endpoints support `Idempotency-Key` header.
