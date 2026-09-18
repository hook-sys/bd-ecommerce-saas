import { describe, it, expect, vi, beforeEach } from "vitest";

const requireFeature = vi.fn();
const findUniqueTenant = vi.fn();

vi.mock("@/lib/server/features/feature-service", () => ({
  requireFeature: (...args: unknown[]) => requireFeature(...args),
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    tenant: { findUnique: (...args: unknown[]) => findUniqueTenant(...args) },
  },
}));

import { getAppearanceData, getDashboardSummary } from "@/lib/server/services/dashboard-service";
import type { DashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";

const CONTEXT: DashboardTenantContext = {
  tenant: { id: "rahim-tenant", slug: "rahim", name: "Rahim Fashion", status: "ACTIVE", planId: "basic" },
  role: "TENANT_OWNER",
  effectiveFeatures: {},
};

describe("getAppearanceData — feature-gated identically for page and API", () => {
  beforeEach(() => {
    requireFeature.mockReset();
  });

  it("blocks when theme_library is disabled for the tenant", async () => {
    requireFeature.mockRejectedValue(Object.assign(new Error("off"), { code: "FEATURE_DISABLED" }));
    await expect(getAppearanceData(CONTEXT)).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    expect(requireFeature).toHaveBeenCalledWith("rahim-tenant", "basic", "theme_library");
  });

  it("resolves when theme_library is enabled", async () => {
    requireFeature.mockResolvedValue(undefined);
    const data = await getAppearanceData(CONTEXT);
    expect(data.themeLibraryEnabled).toBe(true);
  });
});

describe("getDashboardSummary", () => {
  beforeEach(() => {
    findUniqueTenant.mockReset();
  });

  it("surfaces plan, subscription status, and active theme name from the resolved tenant", async () => {
    findUniqueTenant.mockResolvedValue({
      plan: { name: "Basic" },
      subscription: { status: "TRIAL" },
      activeTenantTheme: { theme: { name: "Fashion Pro" } },
    });

    const summary = await getDashboardSummary(CONTEXT);
    expect(summary).toMatchObject({
      storeName: "Rahim Fashion",
      storeSlug: "rahim",
      tenantStatus: "ACTIVE",
      subscriptionStatus: "TRIAL",
      planName: "Basic",
      activeThemeName: "Fashion Pro",
    });
  });

  it("handles a tenant with no theme installed yet", async () => {
    findUniqueTenant.mockResolvedValue({ plan: null, subscription: null, activeTenantTheme: null });

    const summary = await getDashboardSummary(CONTEXT);
    expect(summary.activeThemeName).toBeNull();
    expect(summary.planName).toBeNull();
  });
});
