import { describe, it, expect, vi, beforeEach } from "vitest";

const findUniqueTheme = vi.fn();

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    theme: { findUnique: (...args: unknown[]) => findUniqueTheme(...args) },
  },
}));

import { isThemeEligibleForTenant } from "@/lib/server/repositories/theme-repository";

describe("isThemeEligibleForTenant", () => {
  beforeEach(() => {
    findUniqueTheme.mockReset();
  });

  it("is never eligible if the theme doesn't exist", async () => {
    findUniqueTheme.mockResolvedValue(null);
    expect(await isThemeEligibleForTenant("theme-1", "tenant-1", "basic")).toBe(false);
  });

  it("is never eligible unless the theme is PUBLISHED, even with ALL visibility", async () => {
    findUniqueTheme.mockResolvedValue({
      status: "DRAFT",
      visibilityType: "ALL",
      planVisibilities: [],
      tenantVisibilities: [],
    });
    expect(await isThemeEligibleForTenant("theme-1", "tenant-1", "basic")).toBe(false);
  });

  it("is eligible for every tenant when visibility is ALL and the theme is published", async () => {
    findUniqueTheme.mockResolvedValue({
      status: "PUBLISHED",
      visibilityType: "ALL",
      planVisibilities: [],
      tenantVisibilities: [],
    });
    expect(await isThemeEligibleForTenant("theme-1", "tenant-1", null)).toBe(true);
  });

  it("SELECTED_PLANS: eligible only when the tenant's plan is in the visibility list", async () => {
    findUniqueTheme.mockResolvedValue({
      status: "PUBLISHED",
      visibilityType: "SELECTED_PLANS",
      planVisibilities: [{ id: "pv1" }],
      tenantVisibilities: [],
    });
    expect(await isThemeEligibleForTenant("theme-1", "tenant-1", "pro")).toBe(true);
  });

  it("SELECTED_PLANS: not eligible when the tenant's plan isn't in the visibility list", async () => {
    findUniqueTheme.mockResolvedValue({
      status: "PUBLISHED",
      visibilityType: "SELECTED_PLANS",
      planVisibilities: [],
      tenantVisibilities: [],
    });
    expect(await isThemeEligibleForTenant("theme-1", "tenant-1", "basic")).toBe(false);
  });

  it("SELECTED_TENANTS: eligible only when this specific tenant is granted access (a bespoke VIP theme)", async () => {
    findUniqueTheme.mockResolvedValue({
      status: "PUBLISHED",
      visibilityType: "SELECTED_TENANTS",
      planVisibilities: [],
      tenantVisibilities: [{ id: "tv1" }],
    });
    expect(await isThemeEligibleForTenant("theme-1", "rahim-tenant", null)).toBe(true);
  });

  it("SELECTED_TENANTS: a different tenant (e.g. Karim) is not eligible for Rahim's VIP theme", async () => {
    findUniqueTheme.mockResolvedValue({
      status: "PUBLISHED",
      visibilityType: "SELECTED_TENANTS",
      planVisibilities: [],
      tenantVisibilities: [], // Karim's tenantId not present in the grant list
    });
    expect(await isThemeEligibleForTenant("theme-1", "karim-tenant", null)).toBe(false);
  });
});
