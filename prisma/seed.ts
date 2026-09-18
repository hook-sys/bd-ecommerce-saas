import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Seeds the minimum reference data the app assumes exists: a trial plan
// (used by automated onboarding) plus a small starter catalog of plans and
// features so Super Admin has something real to manage on first login.
async function main() {
  const featureDefs = [
    { key: "products", name: "Product Management" },
    { key: "orders", name: "Order Management" },
    { key: "inventory", name: "Inventory" },
    { key: "coupons", name: "Coupons" },
    { key: "reviews", name: "Reviews" },
    { key: "courier", name: "Courier Integration" },
    { key: "bkash", name: "bKash Payments" },
    { key: "nagad", name: "Nagad Payments" },
    { key: "facebook_pixel", name: "Facebook Pixel" },
    { key: "advanced_analytics", name: "Advanced Analytics" },
    { key: "pos", name: "Point of Sale" },
    { key: "custom_domain", name: "Custom Domain" },
    { key: "theme_library", name: "Theme Library" },
    { key: "product_catalog", name: "Product Catalog" },
  ];

  const features = new Map<string, string>();
  for (const f of featureDefs) {
    const created = await prisma.feature.upsert({
      where: { key: f.key },
      update: { name: f.name },
      create: { key: f.key, name: f.name },
    });
    features.set(f.key, created.id);
  }

  const planDefs = [
    { key: "trial", name: "Trial", fee: 0, on: ["products", "orders", "inventory", "theme_library", "product_catalog"] },
    {
      key: "basic",
      name: "Basic",
      fee: 1000,
      on: ["products", "orders", "inventory", "coupons", "reviews", "theme_library", "product_catalog"],
    },
    {
      key: "pro",
      name: "Pro",
      fee: 2500,
      on: [
        "products",
        "orders",
        "inventory",
        "coupons",
        "reviews",
        "courier",
        "bkash",
        "nagad",
        "facebook_pixel",
        "theme_library",
        "product_catalog",
      ],
    },
    { key: "business", name: "Business", fee: 5000, on: featureDefs.map((f) => f.key) },
  ];

  for (const p of planDefs) {
    const plan = await prisma.plan.upsert({
      where: { key: p.key },
      update: { name: p.name, defaultMonthlyFee: p.fee },
      create: { key: p.key, name: p.name, defaultMonthlyFee: p.fee },
    });

    for (const f of featureDefs) {
      const featureId = features.get(f.key)!;
      await prisma.planFeature.upsert({
        where: { planId_featureId: { planId: plan.id, featureId } },
        update: { enabled: p.on.includes(f.key) },
        create: { planId: plan.id, featureId, enabled: p.on.includes(f.key) },
      });
    }
  }

  console.log("Seed complete: features + plans (trial/basic/pro/business) ready.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
