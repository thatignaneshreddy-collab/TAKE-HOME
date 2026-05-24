"use client";

import { useState, useId } from "react";
import { useProducts, useCreateReservation, ApiRequestError } from "@/hooks/useInventory";
import { Product, InventoryItem } from "@/types";
import { useRouter } from "next/navigation";

// ── Stock badge ───────────────────────────────────────────────────────────

function StockBadge({ available, total }: { available: number; total: number }) {
  const level =
    available === 0 ? "out" : available <= 2 ? "critical" : available <= 10 ? "low" : "ok";

  const styles = {
    out: { bg: "var(--danger-dim)", color: "var(--danger)", label: "Out of stock" },
    critical: { bg: "var(--danger-dim)", color: "var(--danger)", label: `${available} left` },
    low: { bg: "var(--warning-dim)", color: "var(--warning)", label: `${available} available` },
    ok: { bg: "var(--accent-dim)", color: "var(--accent)", label: `${available} available` },
  }[level];

  return (
    <span
      style={{
        background: styles.bg,
        color: styles.color,
        padding: "2px 8px",
        borderRadius: "2px",
        fontSize: "11px",
        fontFamily: "var(--font-mono)",
        fontWeight: 500,
        letterSpacing: "0.02em",
      }}
    >
      {styles.label}
    </span>
  );
}

// ── Reserve modal ─────────────────────────────────────────────────────────

function ReserveModal({
  product,
  inventoryItem,
  onClose,
  onSuccess,
}: {
  product: Product;
  inventoryItem: InventoryItem;
  onClose: () => void;
  onSuccess: (reservationId: string) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync, isPending } = useCreateReservation();
  const formId = useId();

  const max = inventoryItem.availableStock;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      const reservation = await mutateAsync({
        productId: product.id,
        warehouseId: inventoryItem.warehouseId,
        quantity,
        idempotencyKey: `res-${product.id}-${inventoryItem.warehouseId}-${Date.now()}`,
      });
      onSuccess(reservation.id);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.body.error);
      } else {
        setError("An unexpected error occurred");
      }
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "16px",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="animate-fade-in"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-bright)",
          borderRadius: "var(--radius-lg)",
          padding: "32px",
          width: "100%",
          maxWidth: "480px",
        }}
      >
        <div style={{ marginBottom: "24px" }}>
          <div
            style={{
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: "6px",
            }}
          >
            Reserve Care Item
          </div>
          <h2 style={{ fontSize: "18px", fontWeight: 600, color: "var(--text-primary)" }}>
            {product.name}
          </h2>
          <div
            style={{
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              color: "var(--text-secondary)",
              marginTop: "4px",
            }}
          >
            {inventoryItem.warehouse.name} - {inventoryItem.warehouse.location}
          </div>
        </div>

        <form id={formId} onSubmit={handleSubmit}>
          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: "8px",
              }}
            >
              Quantity
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                style={{
                  width: "36px",
                  height: "36px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  color: "var(--text-primary)",
                  fontSize: "18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={max}
                value={quantity}
                onChange={(e) =>
                  setQuantity(
                    Math.min(max, Math.max(1, parseInt(e.target.value) || 1))
                  )
                }
                style={{
                  width: "80px",
                  height: "36px",
                  background: "var(--surface-3)",
                  border: "1px solid var(--border-bright)",
                  borderRadius: "var(--radius)",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "16px",
                  textAlign: "center",
                  padding: "0 8px",
                }}
              />
              <button
                type="button"
                onClick={() => setQuantity(Math.min(max, quantity + 1))}
                style={{
                  width: "36px",
                  height: "36px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  color: "var(--text-primary)",
                  fontSize: "18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                +
              </button>
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                of {max} available
              </span>
            </div>
          </div>

          <div
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "12px 16px",
              marginBottom: "20px",
              fontSize: "12px",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Reservation holds care capacity for 15 minutes. Must confirm to complete.
          </div>

          {error && (
            <div
              className="animate-fade-in"
              style={{
                background: "var(--danger-dim)",
                border: "1px solid var(--danger)",
                borderRadius: "var(--radius)",
                padding: "10px 14px",
                marginBottom: "16px",
                fontSize: "13px",
                color: "var(--danger)",
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                height: "40px",
                background: "transparent",
                border: "1px solid var(--border-bright)",
                borderRadius: "var(--radius)",
                color: "var(--text-secondary)",
                fontSize: "13px",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || max === 0}
              style={{
                flex: 2,
                height: "40px",
                background: isPending ? "var(--accent-dim)" : "var(--accent)",
                border: "none",
                borderRadius: "var(--radius)",
                color: "#0c0c0d",
                fontSize: "13px",
                fontWeight: 600,
                cursor: isPending ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                fontFamily: "var(--font-sans)",
                transition: "opacity 0.15s",
              }}
            >
              {isPending && <div className="spinner" style={{ borderTopColor: "#0c0c0d", borderColor: "rgba(0,0,0,0.2)" }} />}
              {isPending ? "Reserving..." : `Reserve ${quantity} item${quantity !== 1 ? "s" : ""}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Product card ──────────────────────────────────────────────────────────

function ProductCard({
  product,
  onReserve,
}: {
  product: Product;
  onReserve: (product: Product, item: InventoryItem) => void;
}) {
  const totalAvailable = product.inventory.reduce(
    (sum, i) => sum + i.availableStock,
    0
  );

  return (
    <div
      className="animate-fade-in"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = "var(--border-bright)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = "var(--border)")
      }
    >
      {/* Header */}
      <div
        style={{
          padding: "20px 24px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h3
              style={{
                fontSize: "15px",
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: "4px",
              }}
            >
              {product.name}
            </h3>
            <span
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--text-muted)",
              }}
            >
              SKU: {product.sku}
            </span>
          </div>
          <div
            style={{
              textAlign: "right",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              color: "var(--text-secondary)",
            }}
          >
            <div style={{ fontSize: "20px", color: totalAvailable > 0 ? "var(--accent)" : "var(--danger)", fontWeight: 600 }}>
              {totalAvailable}
            </div>
            <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>total avail.</div>
          </div>
        </div>
      </div>

      {/* Inventory rows */}
      <div>
        {product.inventory.map((item) => (
          <div
            key={item.id}
            style={{
              padding: "14px 24px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  marginBottom: "2px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.warehouse.name}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {item.warehouse.location} - {item.totalStock} total - {item.reservedStock} reserved
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
              <StockBadge
                available={item.availableStock}
                total={item.totalStock}
              />
              <button
                onClick={() => onReserve(product, item)}
                disabled={item.availableStock === 0}
                style={{
                  height: "30px",
                  padding: "0 14px",
                  background:
                    item.availableStock === 0
                      ? "var(--surface-3)"
                      : "var(--accent-dim)",
                  border: `1px solid ${item.availableStock === 0 ? "var(--border)" : "var(--accent)"}`,
                  borderRadius: "var(--radius)",
                  color:
                    item.availableStock === 0
                      ? "var(--text-muted)"
                      : "var(--accent)",
                  fontSize: "12px",
                  fontWeight: 500,
                  cursor: item.availableStock === 0 ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                  fontFamily: "var(--font-sans)",
                }}
              >
                Reserve
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const { data: products, isLoading, error, dataUpdatedAt } = useProducts();
  const router = useRouter();

  const [modal, setModal] = useState<{
    product: Product;
    item: InventoryItem;
  } | null>(null);

  const summary = products?.reduce(
    (acc, product) => {
      acc.products += 1;
      for (const item of product.inventory) {
        acc.available += item.availableStock;
        acc.reserved += item.reservedStock;
      }
      return acc;
    },
    { products: 0, available: 0, reserved: 0 }
  );

  function handleReserve(product: Product, item: InventoryItem) {
    setModal({ product, item });
  }

  function handleReserveSuccess(reservationId: string) {
    setModal(null);
    router.push(`/reservations/${reservationId}`);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
      }}
    >
      {/* Top nav */}
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "0 32px",
          height: "56px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          background: "rgba(12, 12, 13, 0.9)",
          backdropFilter: "blur(12px)",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "2px",
              background: "var(--accent)",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "14px",
              fontWeight: 500,
              color: "var(--text-primary)",
              letterSpacing: "-0.01em",
            }}
          >
            ALLO CARE INVENTORY
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {dataUpdatedAt > 0 && (
            <span
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--text-muted)",
              }}
            >
              Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: "var(--success)",
            }}
          >
            <div
              style={{
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                background: "var(--success)",
                animation: "pulse-dot 2s ease-in-out infinite",
              }}
            />
            LIVE
          </div>
        </div>
      </header>

      {/* Content */}
      <main style={{ padding: "32px", maxWidth: "1040px", margin: "0 auto" }}>
        <div style={{ marginBottom: "32px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: "24px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: "24px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: "6px",
                }}
              >
                Care Inventory
              </h1>
              <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                Reserve science-backed, stigma-free care resources while preserving patient privacy.
              </p>
            </div>

            {summary && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(92px, 1fr))",
                  gap: "8px",
                  minWidth: "320px",
                }}
              >
                {[
                  ["Care Items", summary.products],
                  ["Available", summary.available],
                  ["Reserved", summary.reserved],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      padding: "10px 12px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "10px",
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        fontSize: "18px",
                        fontWeight: 600,
                        color:
                          label === "Available"
                            ? "var(--accent)"
                            : "var(--text-primary)",
                      }}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {isLoading && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              color: "var(--text-secondary)",
              padding: "40px 0",
            }}
          >
            <div className="spinner" />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px" }}>
              Loading inventory...
            </span>
          </div>
        )}

        {error && (
          <div
            style={{
              background: "var(--danger-dim)",
              border: "1px solid var(--danger)",
              borderRadius: "var(--radius-lg)",
              padding: "16px 20px",
              color: "var(--danger)",
              fontSize: "13px",
              fontFamily: "var(--font-mono)",
            }}
          >
            Failed to load inventory. Check your connection.
          </div>
        )}

        {products && (
          <div
            style={{
              display: "grid",
              gap: "16px",
            }}
          >
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onReserve={handleReserve}
              />
            ))}
          </div>
        )}
      </main>

      {modal && (
        <ReserveModal
          product={modal.product}
          inventoryItem={modal.item}
          onClose={() => setModal(null)}
          onSuccess={handleReserveSuccess}
        />
      )}
    </div>
  );
}
