import { describe, it, expect, vi, beforeEach } from "vitest";

const requireUser = vi.fn();
const resolveDashboardTenantContext = vi.fn();
const getAppearanceData = vi.fn();

vi.mock("@/lib/server/auth/require-role", () => ({
  requireUser: (...args: unknown[]) => requireUser(...args),
}));

vi.mock("@/lib/server/tenant/dashboard-tenant-context", () => ({
  resolveDashboardTenantContext: (...args: unknown[]) => resolveDashboardTenantContext(...args),
}));

vi.mock("@/lib/server/services/dashboard-service", () => ({
  getAppearanceData: (...args: unknown[]) => getAppearanceData(...args),
}));

import { GET } from "@/app/api/dashboard/appearance/route";
import { AppError } from "@/lib/errors/app-error";

const CONTEXT = {
  tenant: { id: "t1", slug: "rahim", name: "Rahim Fashion", status: "ACTIVE", planId: "basic" },
  role: "TENANT_OWNER",
  effectiveFeatures: {},
};

describe("GET /api/dashboard/appearance", () => {
  beforeEach(() => {
    requireUser.mockReset();
    resolveDashboardTenantContext.mockReset();
    getAppearanceData.mockReset();
  });

  it("returns 401 when there is no authenticated session", async () => {
    requireUser.mockRejectedValue(new AppError("UNAUTHORIZED", "You must be signed in."));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 FEATURE_DISABLED when theme_library is off for the tenant, even hit directly", async () => {
    requireUser.mockResolvedValue({ id: "u1" });
    resolveDashboardTenantContext.mockResolvedValue(CONTEXT);
    getAppearanceData.mockRejectedValue(new AppError("FEATURE_DISABLED", "Theme Library is not enabled."));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe("FEATURE_DISABLED");
  });

  it("returns 200 with appearance data when the feature is enabled", async () => {
    requireUser.mockResolvedValue({ id: "u1" });
    resolveDashboardTenantContext.mockResolvedValue(CONTEXT);
    getAppearanceData.mockResolvedValue({ tenantId: "t1", themeLibraryEnabled: true });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.themeLibraryEnabled).toBe(true);
  });
});
