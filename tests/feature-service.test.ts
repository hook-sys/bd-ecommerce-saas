import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyFeature = vi.fn();
const findManyPlanFeature = vi.fn();
const findManyTenantFeature = vi.fn();

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    feature: { findMany: (...args: unknown[]) => findManyFeature(...args) },
    planFeature: { findMany: (...args: unknown[]) => findManyPlanFeature(...args) },
    tenantFeature: { findMany: (...args: unknown[]) => findManyTenantFeature(...args) },
  },
}));

import { getEffectiveFeatures, isFeatureEnabled, requireFeature } from "@/lib/server/features/feature-service";

describe("FeatureService resolution order (tenant override > plan > default off)", () => {
  beforeEach(() => {
    findManyFeature.mockReset();
    findManyPlanFeature.mockReset();
    findManyTenantFeature.mockReset();

    findManyFeature.mockResolvedValue([
      { key: "products" },
      { key: "courier" },
      { key: "pos" },
    ]);
  });

  it("defaults every known feature to false when there is no plan and no override", async () => {
    findManyPlanFeature.mockResolvedValue([]);
    findManyTenantFeature.mockResolvedValue([]);

    const result = await getEffectiveFeatures("tenant-1", null);
    expect(result).toEqual({ products: false, courier: false, pos: false });
  });

  it("applies the plan default when there is no tenant override", async () => {
    findManyPlanFeature.mockResolvedValue([
      { feature: { key: "products" }, enabled: true },
      { feature: { key: "courier" }, enabled: false },
    ]);
    findManyTenantFeature.mockResolvedValue([]);

    const result = await getEffectiveFeatures("tenant-1", "basic-plan");
    expect(result.products).toBe(true);
    expect(result.courier).toBe(false);
  });

  it("lets a tenant override take precedence over the plan default (Rahim gets Courier)", async () => {
    findManyPlanFeature.mockResolvedValue([{ feature: { key: "courier" }, enabled: false }]);
    findManyTenantFeature.mockResolvedValue([{ feature: { key: "courier" }, enabled: true }]);

    const result = await getEffectiveFeatures("rahim-tenant", "basic-plan");
    expect(result.courier).toBe(true);
  });

  it("lets a tenant override disable a feature the plan enables", async () => {
    findManyPlanFeature.mockResolvedValue([{ feature: { key: "pos" }, enabled: true }]);
    findManyTenantFeature.mockResolvedValue([{ feature: { key: "pos" }, enabled: false }]);

    const result = await getEffectiveFeatures("tenant-2", "business-plan");
    expect(result.pos).toBe(false);
  });

  it("isFeatureEnabled reflects the same resolution", async () => {
    findManyPlanFeature.mockResolvedValue([{ feature: { key: "products" }, enabled: true }]);
    findManyTenantFeature.mockResolvedValue([]);

    expect(await isFeatureEnabled("tenant-1", "basic-plan", "products")).toBe(true);
    expect(await isFeatureEnabled("tenant-1", "basic-plan", "courier")).toBe(false);
  });

  it("requireFeature throws FEATURE_DISABLED when the feature is off", async () => {
    findManyPlanFeature.mockResolvedValue([]);
    findManyTenantFeature.mockResolvedValue([]);

    await expect(requireFeature("tenant-1", "basic-plan", "courier")).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
  });

  it("requireFeature resolves silently when the feature is on", async () => {
    findManyPlanFeature.mockResolvedValue([{ feature: { key: "products" }, enabled: true }]);
    findManyTenantFeature.mockResolvedValue([]);

    await expect(requireFeature("tenant-1", "basic-plan", "products")).resolves.toBeUndefined();
  });
});
