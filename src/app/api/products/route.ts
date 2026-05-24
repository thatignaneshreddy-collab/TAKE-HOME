import { NextResponse } from "next/server";
import { getProductsWithInventory } from "@/lib/services/inventory.service";

export const dynamic = "force-dynamic"; // Never cache — stock is real-time

export async function GET() {
  try {
    const products = await getProductsWithInventory();
    return NextResponse.json({ products });
  } catch (err) {
    console.error("[GET /api/products]", err);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}
