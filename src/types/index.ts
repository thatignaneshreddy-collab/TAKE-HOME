export interface Warehouse {
  id: string;
  name: string;
  location: string;
}

export interface InventoryItem {
  id: string;
  productId: string;
  warehouseId: string;
  totalStock: number;
  reservedStock: number;
  availableStock: number;
  warehouse: Warehouse;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  description?: string;
  inventory: InventoryItem[];
}

export type ReservationStatus = "pending" | "confirmed" | "released";

export interface Reservation {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  product: { id: string; name: string; sku: string };
  warehouse: { id: string; name: string; location: string };
}

export interface ApiError {
  error: string;
  details?: { field: string; message: string }[];
}
