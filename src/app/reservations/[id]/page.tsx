"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  useReservation,
  useConfirmReservation,
  useReleaseReservation,
  ApiRequestError,
} from "@/hooks/useInventory";
import { useCountdown } from "@/hooks/useCountdown";
import { Reservation } from "@/types";

// ── Status badge ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Reservation["status"] }) {
  const config = {
    pending: { label: "PENDING", color: "var(--warning)", bg: "var(--warning-dim)" },
    confirmed: { label: "CONFIRMED", color: "var(--success)", bg: "var(--success-dim)" },
    released: { label: "RELEASED", color: "var(--text-muted)", bg: "var(--surface-3)" },
  }[status];

  return (
    <span
      style={{
        background: config.bg,
        color: config.color,
        padding: "3px 10px",
        borderRadius: "2px",
        fontSize: "11px",
        fontFamily: "var(--font-mono)",
        fontWeight: 500,
        letterSpacing: "0.08em",
      }}
    >
      {config.label}
    </span>
  );
}

// ── Countdown ring ────────────────────────────────────────────────────────

function CountdownDisplay({
  expiresAt,
  status,
}: {
  expiresAt: string;
  status: Reservation["status"];
}) {
  const countdown = useCountdown(status === "pending" ? expiresAt : null);

  if (status !== "pending") {
    return (
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          color: "var(--text-muted)",
        }}
      >
        -
      </div>
    );
  }

  const color =
    countdown.urgencyLevel === "critical"
      ? "var(--danger)"
      : countdown.urgencyLevel === "warning"
      ? "var(--warning)"
      : "var(--accent)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "28px",
          fontWeight: 300,
          color,
          letterSpacing: "-0.02em",
          transition: "color 0.5s",
        }}
      >
        {countdown.isExpired ? "00:00" : countdown.formattedTime}
      </div>
      {countdown.isExpired && (
        <span
          style={{
            fontSize: "11px",
            color: "var(--danger)",
            fontFamily: "var(--font-mono)",
            background: "var(--danger-dim)",
            padding: "2px 8px",
            borderRadius: "2px",
          }}
        >
          EXPIRED
        </span>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

function ActionLinkButton({
  href,
  children,
  variant = "accent",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "accent" | "success";
}) {
  const isSuccess = variant === "success";

  return (
    <Link
      href={href}
      style={{
        minHeight: "38px",
        padding: "0 16px",
        background: isSuccess ? "var(--success)" : "var(--accent)",
        borderRadius: "var(--radius)",
        color: "#0c0c0d",
        fontSize: "13px",
        fontWeight: 600,
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-sans)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Link>
  );
}

export default function ReservationPage() {
  const { id } = useParams<{ id: string }>();
  const { data: reservation, isLoading, error } = useReservation(id);

  const confirmMutation = useConfirmReservation();
  const releaseMutation = useReleaseReservation();

  const [actionError, setActionError] = useState<{
    message: string;
    code: number;
  } | null>(null);

  const countdown = useCountdown(
    reservation?.status === "pending" ? reservation.expiresAt : null
  );

  async function handleConfirm() {
    setActionError(null);
    try {
      await confirmMutation.mutateAsync({
        id,
        idempotencyKey: `confirm-${id}`,
      });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setActionError({ message: err.body.error, code: err.status });
      }
    }
  }

  async function handleRelease() {
    setActionError(null);
    try {
      await releaseMutation.mutateAsync(id);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setActionError({ message: err.body.error, code: err.status });
      }
    }
  }

  const isPending = reservation?.status === "pending";
  const isConfirmed = reservation?.status === "confirmed";
  const isReleased = reservation?.status === "released";
  const isExpired = isPending && countdown.isExpired;
  const isActing = confirmMutation.isPending || releaseMutation.isPending;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Header */}
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
        <Link
          href="/"
          style={{
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
            color: "var(--text-secondary)",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          Back to inventory
        </Link>
      </header>

      <main style={{ padding: "32px", maxWidth: "680px", margin: "0 auto" }}>
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
              Loading reservation...
            </span>
          </div>
        )}

        {error && (
          <div
            style={{
              background: "var(--danger-dim)",
              border: "1px solid var(--danger)",
              borderRadius: "var(--radius-lg)",
              padding: "20px",
              color: "var(--danger)",
              fontFamily: "var(--font-mono)",
              fontSize: "13px",
            }}
          >
            Reservation not found.
          </div>
        )}

        {reservation && (
          <div className="animate-fade-in">
            {/* Card */}
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
                marginBottom: "20px",
              }}
            >
              {/* Card header */}
              <div
                style={{
                  padding: "24px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div>
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
                    Reservation
                  </div>
                  <h1
                    style={{
                      fontSize: "20px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      marginBottom: "4px",
                    }}
                  >
                    {reservation.product.name}
                  </h1>
                  <div
                    style={{
                      fontSize: "11px",
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {reservation.product.sku}
                  </div>
                </div>
                <StatusBadge status={reservation.status} />
              </div>

              {/* Details grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {[
                  {
                    label: "Warehouse",
                    value: reservation.warehouse.name,
                    sub: reservation.warehouse.location,
                  },
                  {
                    label: "Quantity",
                    value: `${reservation.quantity} unit${reservation.quantity !== 1 ? "s" : ""}`,
                  },
                  {
                    label: "Reserved at",
                    value: new Date(reservation.createdAt).toLocaleString(),
                  },
                  {
                    label: "Expires",
                    value: new Date(reservation.expiresAt).toLocaleTimeString(),
                    sub: new Date(reservation.expiresAt).toLocaleDateString(),
                  },
                ].map((field, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "16px 24px",
                      borderRight: i % 2 === 0 ? "1px solid var(--border)" : "none",
                      borderBottom:
                        i < 2 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "10px",
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: "4px",
                      }}
                    >
                      {field.label}
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "var(--text-primary)",
                      }}
                    >
                      {field.value}
                    </div>
                    {field.sub && (
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--text-muted)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {field.sub}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Countdown section */}
              {isPending && (
                <div
                  style={{
                    padding: "20px 24px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "10px",
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: "8px",
                    }}
                  >
                    Time remaining
                  </div>
                  <CountdownDisplay
                    expiresAt={reservation.expiresAt}
                    status={reservation.status}
                  />
                </div>
              )}

              {/* Reservation ID */}
              <div style={{ padding: "12px 24px" }}>
                <span
                  style={{
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-muted)",
                  }}
                >
                  ID: {reservation.id}
                </span>
              </div>
            </div>

            {/* Error display */}
            {actionError && (
              <div
                className="animate-fade-in"
                style={{
                  background: actionError.code === 410 ? "var(--warning-dim)" : "var(--danger-dim)",
                  border: `1px solid ${actionError.code === 410 ? "var(--warning)" : "var(--danger)"}`,
                  borderRadius: "var(--radius)",
                  padding: "12px 16px",
                  marginBottom: "16px",
                  fontSize: "13px",
                  color: actionError.code === 410 ? "var(--warning)" : "var(--danger)",
                  fontFamily: "var(--font-mono)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span style={{ fontSize: "16px" }}>
                  {actionError.code === 409 ? "!" : actionError.code === 410 ? "410" : "x"}
                </span>
                <div>
                  <div style={{ fontWeight: 500 }}>
                    HTTP {actionError.code}
                  </div>
                  <div style={{ fontSize: "12px", opacity: 0.85 }}>
                    {actionError.message}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            {isPending && !isExpired && (
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={handleRelease}
                  disabled={isActing}
                  style={{
                    flex: 1,
                    height: "44px",
                    background: "transparent",
                    border: "1px solid var(--border-bright)",
                    borderRadius: "var(--radius)",
                    color: "var(--text-secondary)",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: isActing ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  {releaseMutation.isPending && <div className="spinner" style={{ width: "14px", height: "14px" }} />}
                  Cancel reservation
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isActing}
                  style={{
                    flex: 2,
                    height: "44px",
                    background: isActing ? "var(--accent-dim)" : "var(--accent)",
                    border: "none",
                    borderRadius: "var(--radius)",
                    color: "#0c0c0d",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: isActing ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  {confirmMutation.isPending && (
                    <div
                      className="spinner"
                      style={{
                        width: "14px",
                        height: "14px",
                        borderTopColor: "#0c0c0d",
                        borderColor: "rgba(0,0,0,0.2)",
                      }}
                    />
                  )}
                  Confirm purchase
                </button>
              </div>
            )}

            {isExpired && (
              <div
                style={{
                  background: "var(--warning-dim)",
                  border: "1px solid var(--warning)",
                  borderRadius: "var(--radius)",
                  padding: "16px 20px",
                  color: "var(--warning)",
                  fontSize: "13px",
                  fontFamily: "var(--font-mono)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <span>HTTP 410: This reservation has expired.</span>
                <ActionLinkButton href="/">Back to inventory</ActionLinkButton>
              </div>
            )}

            {isConfirmed && (
              <div
                style={{
                  background: "var(--success-dim)",
                  border: "1px solid var(--success)",
                  borderRadius: "var(--radius)",
                  padding: "16px 20px",
                  color: "var(--success)",
                  fontSize: "13px",
                  fontFamily: "var(--font-mono)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <span>Purchase confirmed. Stock permanently allocated.</span>
                <ActionLinkButton href="/" variant="success">
                  Back to inventory
                </ActionLinkButton>
              </div>
            )}

            {isReleased && !isExpired && (
              <div
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "16px 20px",
                  color: "var(--text-muted)",
                  fontSize: "13px",
                  fontFamily: "var(--font-mono)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <span>Reservation released. Stock returned to inventory.</span>
                <ActionLinkButton href="/">Back to inventory</ActionLinkButton>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
