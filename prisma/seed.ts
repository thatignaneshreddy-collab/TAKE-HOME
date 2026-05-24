/**
 * Seed script: creates realistic multi-product, multi-warehouse inventory.
 * Includes deliberately low-stock and zero-stock cases for demo purposes.
 *
 * Run: npx prisma db seed
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Clean slate — order matters due to FK constraints
  await prisma.reservation.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  // ── Warehouses ────────────────────────────────────────────────────────────
  const [east, west, central] = await Promise.all([
    prisma.warehouse.create({
      data: { name: "East India Hub", location: "Kolkata, West Bengal" },
    }),
    prisma.warehouse.create({
      data: { name: "West India Hub", location: "Mumbai, Maharashtra" },
    }),
    prisma.warehouse.create({
      data: { name: "Central India Distribution", location: "Nagpur, Maharashtra" },
    }),
  ]);

  console.log("✓ Warehouses created");

  // ── Products ──────────────────────────────────────────────────────────────
  const [
    wellnessKit,
    fertilityKit,
    stiScreeningKit,
    medicationStarterPack,
    privacyConsultPack,
    contraceptionCareKit,
    pcosCarePlan,
    utiReliefKit,
    menopauseSupportPack,
    pelvicFloorTherapyPack,
    hormonePanelKit,
    couplesTherapyPack,
  ] = await Promise.all([
    prisma.product.create({
      data: {
        name: "Sexual Wellness Care Kit",
        sku: "ALLO-WELLNESS-KIT",
        description:
          "Discreet wellness essentials for stigma-free sexual health support",
      },
    }),
    prisma.product.create({
      data: {
        name: "Fertility Assessment Kit",
        sku: "ALLO-FERTILITY-ASSESS",
        description:
          "At-home fertility assessment kit backed by specialist-led care",
      },
    }),
    prisma.product.create({
      data: {
        name: "STI Screening Kit",
        sku: "ALLO-STI-SCREEN",
        description:
          "Private sample collection kit for confidential STI screening",
      },
    }),
    prisma.product.create({
      data: {
        name: "Erectile Health Starter Pack",
        sku: "ALLO-ED-STARTER",
        description:
          "Clinician-guided starter pack for science-backed erectile health care",
      },
    }),
    prisma.product.create({
      data: {
        name: "Private Specialist Consult Pack",
        sku: "ALLO-PRIVATE-CONSULT",
        description:
          "Reserved capacity for expert-led, judgment-free virtual consultations",
      },
    }),
    prisma.product.create({
      data: {
        name: "Contraception Counseling Pack",
        sku: "ALLO-CONTRACEPTION-CARE",
        description:
          "Private counseling capacity for personalized contraception guidance",
      },
    }),
    prisma.product.create({
      data: {
        name: "PCOS Care Plan Kit",
        sku: "ALLO-PCOS-CARE",
        description:
          "Specialist-led care plan resources for PCOS and hormonal wellness",
      },
    }),
    prisma.product.create({
      data: {
        name: "UTI Relief Care Kit",
        sku: "ALLO-UTI-RELIEF",
        description:
          "Discreet care resources for timely urinary health support",
      },
    }),
    prisma.product.create({
      data: {
        name: "Menopause Support Pack",
        sku: "ALLO-MENOPAUSE-SUPPORT",
        description:
          "Science-backed support resources for menopause and midlife wellness",
      },
    }),
    prisma.product.create({
      data: {
        name: "Pelvic Floor Therapy Pack",
        sku: "ALLO-PELVIC-FLOOR",
        description:
          "Reserved therapist-led care capacity for pelvic floor concerns",
      },
    }),
    prisma.product.create({
      data: {
        name: "Hormone Panel Collection Kit",
        sku: "ALLO-HORMONE-PANEL",
        description:
          "Private diagnostic collection kit for hormone health insights",
      },
    }),
    prisma.product.create({
      data: {
        name: "Relationship Therapy Session Pack",
        sku: "ALLO-RELATIONSHIP-CARE",
        description:
          "Judgment-free therapist session capacity for intimacy and relationships",
      },
    }),
  ]);

  console.log("✓ Products created");

  // ── Inventory ─────────────────────────────────────────────────────────────
  // Deliberately varying stock levels to make the demo interesting:
  //   - High stock: normal operation
  //   - Low stock (1-3): triggers race condition demos
  //   - Zero stock: always returns 409
  const inventoryData = [
    // Sexual Wellness Care Kit - low stock in East, healthy elsewhere
    { productId: wellnessKit.id, warehouseId: east.id, totalStock: 2 },
    { productId: wellnessKit.id, warehouseId: west.id, totalStock: 45 },
    { productId: wellnessKit.id, warehouseId: central.id, totalStock: 12 },

    // Fertility Assessment Kit - critically low everywhere (good for race condition demo)
    { productId: fertilityKit.id, warehouseId: east.id, totalStock: 1 },
    { productId: fertilityKit.id, warehouseId: west.id, totalStock: 3 },
    { productId: fertilityKit.id, warehouseId: central.id, totalStock: 8 },

    // STI Screening Kit - healthy stock
    { productId: stiScreeningKit.id, warehouseId: east.id, totalStock: 120 },
    { productId: stiScreeningKit.id, warehouseId: west.id, totalStock: 95 },
    { productId: stiScreeningKit.id, warehouseId: central.id, totalStock: 200 },

    // Erectile Health Starter Pack - out of stock in West
    { productId: medicationStarterPack.id, warehouseId: east.id, totalStock: 18 },
    { productId: medicationStarterPack.id, warehouseId: west.id, totalStock: 0 },
    { productId: medicationStarterPack.id, warehouseId: central.id, totalStock: 30 },

    // Private Specialist Consult Pack - scarce
    { productId: privacyConsultPack.id, warehouseId: east.id, totalStock: 1 },
    { productId: privacyConsultPack.id, warehouseId: west.id, totalStock: 1 },
    { productId: privacyConsultPack.id, warehouseId: central.id, totalStock: 4 },

    // Contraception Counseling Pack - steady demand
    { productId: contraceptionCareKit.id, warehouseId: east.id, totalStock: 28 },
    { productId: contraceptionCareKit.id, warehouseId: west.id, totalStock: 34 },
    { productId: contraceptionCareKit.id, warehouseId: central.id, totalStock: 22 },

    // PCOS Care Plan Kit - healthy stock
    { productId: pcosCarePlan.id, warehouseId: east.id, totalStock: 40 },
    { productId: pcosCarePlan.id, warehouseId: west.id, totalStock: 52 },
    { productId: pcosCarePlan.id, warehouseId: central.id, totalStock: 25 },

    // UTI Relief Care Kit - high-volume consumable
    { productId: utiReliefKit.id, warehouseId: east.id, totalStock: 85 },
    { productId: utiReliefKit.id, warehouseId: west.id, totalStock: 110 },
    { productId: utiReliefKit.id, warehouseId: central.id, totalStock: 70 },

    // Menopause Support Pack - moderate stock
    { productId: menopauseSupportPack.id, warehouseId: east.id, totalStock: 16 },
    { productId: menopauseSupportPack.id, warehouseId: west.id, totalStock: 24 },
    { productId: menopauseSupportPack.id, warehouseId: central.id, totalStock: 14 },

    // Pelvic Floor Therapy Pack - limited specialist capacity
    { productId: pelvicFloorTherapyPack.id, warehouseId: east.id, totalStock: 3 },
    { productId: pelvicFloorTherapyPack.id, warehouseId: west.id, totalStock: 6 },
    { productId: pelvicFloorTherapyPack.id, warehouseId: central.id, totalStock: 2 },

    // Hormone Panel Collection Kit - diagnostic stock
    { productId: hormonePanelKit.id, warehouseId: east.id, totalStock: 32 },
    { productId: hormonePanelKit.id, warehouseId: west.id, totalStock: 38 },
    { productId: hormonePanelKit.id, warehouseId: central.id, totalStock: 26 },

    // Relationship Therapy Session Pack - capacity-constrained
    { productId: couplesTherapyPack.id, warehouseId: east.id, totalStock: 5 },
    { productId: couplesTherapyPack.id, warehouseId: west.id, totalStock: 7 },
    { productId: couplesTherapyPack.id, warehouseId: central.id, totalStock: 3 },
  ];

  await prisma.inventory.createMany({ data: inventoryData });

  console.log("✓ Inventory created");
  console.log(`
📊 Seed Summary:
   Warehouses : 3
   Products   : 12
   SKUs       : ${inventoryData.length}
   
⚠️  Low-stock items for race condition testing:
   Fertility Assessment Kit @ East India Hub -> 1 unit
   Private Specialist Consult Pack @ East India Hub -> 1 unit
   Private Specialist Consult Pack @ West India Hub -> 1 unit
   Sexual Wellness Care Kit @ East India Hub -> 2 units
`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

