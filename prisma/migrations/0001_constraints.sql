-- Migration: 0001_initial_schema
-- Adds DB-level CHECK constraints that Prisma schema alone cannot express.
-- These are the last line of defense against corrupted inventory state.

-- Ensure stock values are never negative
ALTER TABLE "Inventory"
  ADD CONSTRAINT "inventory_total_stock_non_negative"
    CHECK ("totalStock" >= 0),
  ADD CONSTRAINT "inventory_reserved_stock_non_negative"
    CHECK ("reservedStock" >= 0),
  ADD CONSTRAINT "inventory_reserved_lte_total"
    CHECK ("reservedStock" <= "totalStock");

-- Ensure reservation quantity is always positive
ALTER TABLE "Reservation"
  ADD CONSTRAINT "reservation_quantity_positive"
    CHECK ("quantity" > 0);

-- Partial index for fast expiry cleanup queries
-- Only indexes pending reservations that haven't expired yet (or just did)
CREATE INDEX "reservation_pending_expires_at_idx"
  ON "Reservation" ("expiresAt")
  WHERE "status" = 'pending';

-- Composite index for the hot path: finding inventory for a specific product+warehouse
CREATE INDEX IF NOT EXISTS "inventory_product_warehouse_idx"
  ON "Inventory" ("productId", "warehouseId");
