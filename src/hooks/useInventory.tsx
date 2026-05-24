"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { Product, Reservation, ApiError } from "@/types";
import React from "react";

// ── Query client singleton ────────────────────────────────────────────────

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000, // 5s — stock data should be fresh
      retry: (failureCount, error) => {
        // Don't retry 4xx errors — those are deterministic
        if (error instanceof ApiRequestError && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// ── Error type ────────────────────────────────────────────────────────────

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public body: ApiError
  ) {
    super(body.error);
    this.name = "ApiRequestError";
  }
}

// ── Fetch helpers ─────────────────────────────────────────────────────────

async function apiFetch<T>(
  url: string,
  options?: RequestInit & { idempotencyKey?: string }
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.idempotencyKey
      ? { "idempotency-key": options.idempotencyKey }
      : {}),
  };

  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiRequestError(res.status, data as ApiError);
  }

  return data as T;
}

// ── Products ──────────────────────────────────────────────────────────────

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: () =>
      apiFetch<{ products: Product[] }>("/api/products").then(
        (d) => d.products
      ),
    refetchInterval: 15_000, // Poll every 15s for stock updates
  });
}

// ── Reservations ──────────────────────────────────────────────────────────

export function useReservation(id: string | null) {
  return useQuery({
    queryKey: ["reservation", id],
    queryFn: () =>
      apiFetch<{ reservation: Reservation }>(`/api/reservations/${id}`).then(
        (d) => d.reservation
      ),
    enabled: !!id,
    refetchInterval: (query) => {
      // Stop polling once in terminal state
      const reservation = query.state.data;
      if (reservation?.status === "confirmed" || reservation?.status === "released")
        return false;
      return 5_000;
    },
  });
}

export function useCreateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      productId,
      warehouseId,
      quantity,
      idempotencyKey,
    }: {
      productId: string;
      warehouseId: string;
      quantity: number;
      idempotencyKey?: string;
    }) =>
      apiFetch<{ reservation: Reservation }>("/api/reservations", {
        method: "POST",
        body: JSON.stringify({ productId, warehouseId, quantity }),
        idempotencyKey,
      }).then((d) => d.reservation),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useConfirmReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      idempotencyKey,
    }: {
      id: string;
      idempotencyKey?: string;
    }) =>
      apiFetch<{ reservation: Reservation }>(
        `/api/reservations/${id}/confirm`,
        { method: "POST", body: JSON.stringify({}), idempotencyKey }
      ).then((d) => d.reservation),
    onSuccess: (data) => {
      qc.setQueryData(["reservation", data.id], data);
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useReleaseReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ reservation: Reservation }>(
        `/api/reservations/${id}/release`,
        { method: "POST", body: JSON.stringify({}) }
      ).then((d) => d.reservation),
    onSuccess: (data) => {
      qc.setQueryData(["reservation", data.id], data);
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
