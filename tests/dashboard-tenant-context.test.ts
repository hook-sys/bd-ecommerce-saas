import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieGet = vi.fn();
const findUniqueTenantUser = vi.fn();
const findFirstTenantUser = vi.fn();
const findManyTenantUser = vi.fn();
const getEffectiveFeatures = vi.fn();
const createAuditLog = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (key: string) => cookieGet(key) }),
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    tenantUser: {
      findUnique: (...args: unknown[]) => findUniqueTenantUser(...args),
      findFirst: (...args: unknown[]) => findFirstTenantUser(...args),
      findMany: (...args: unknown[]) => findManyTenantUser(...args),
    },
  },
}));

vi.mock("@/lib/server/features/feature-service", () => ({
  getEffectiveFeatures: (...args: unknown[]) => getEffectiveFeatures(...args),
}));

vi.mock("@/lib/server/audit/audit-log-service", () => ({
  logAuditEvent: (...args: unknown[]) => createAuditLog(...args),
}));

import { resolveDashboardTenantContext, switchTenant, listTenantMemberships } from "@/lib/server/tenant/dashboard-tenant-context";

const RAHIM_TENANT = { id: "rahim-tenant", slug: "rahim", name: "Rahim Fashion", status: "ACTIVE", planId: "basic" };
const KARIM_TENANT = { id: "karim-tenant", slug: "karim", name: "Karim Electronics", status: "ACTIVE", planId: "pro" };

describe("resolveDashboardTenantContext", () => {
  beforeEach(() => {
    cookieGet.mockReset();
    findUniqueTenantUser.mockReset();
    findFirstTenantUser.mockReset();
    getEffectiveFeatures.mockReset().mockResolvedValue({});
  });

  it("resolves the tenant named by the cookie when the user actually belongs to it", async () => {
    cookieGet.mockReturnValue({ value: "rahim-tenant" });
    findUniqueTenantUser.mockResolvedValue({ role: "TENANT_OWNER", tenant: RAHIM_TENANT });

    const ctx = await resolveDashboardTenantContext("owner-1");
    expect(ctx?.tenant.id).toBe("rahim-tenant");
    expect(findFirstTenantUser).not.toHaveBeenCalled();
  });

  it("falls back to the user's first membership when the cookie points at a tenant they don't belong to", async () => {
    cookieGet.mockReturnValue({ value: "karim-tenant" }); // stale/tampered cookie
    findUniqueTenantUser.mockResolvedValue(null); // Rahim's owner has no membership in Karim's tenant
    findFirstTenantUser.mockResolvedValue({ role: "TENANT_OWNER", tenant: RAHIM_TENANT });

    const ctx = await resolveDashboardTenantContext("rahim-owner");
    // Never silently grants access to the tenant named by the cookie.
    expect(ctx?.tenant.id).toBe("rahim-tenant");
  });

  it("returns null when the user has no tenant membership at all", async () => {
    cookieGet.mockReturnValue(undefined);
    findFirstTenantUser.mockResolvedValue(null);

    expect(await resolveDashboardTenantContext("no-tenant-user")).toBeNull();
  });

  it("computes effectiveFeatures via the same FeatureService used elsewhere (no duplicated logic)", async () => {
    cookieGet.mockReturnValue({ value: "rahim-tenant" });
    findUniqueTenantUser.mockResolvedValue({ role: "TENANT_OWNER", tenant: RAHIM_TENANT });
    getEffectiveFeatures.mockResolvedValue({ theme_library: true });

    const ctx = await resolveDashboardTenantContext("owner-1");
    expect(getEffectiveFeatures).toHaveBeenCalledWith("rahim-tenant", "basic");
    expect(ctx?.effectiveFeatures.theme_library).toBe(true);
  });
});

describe("switchTenant — validates membership, never trusts the requested tenantId alone", () => {
  beforeEach(() => {
    findUniqueTenantUser.mockReset();
    createAuditLog.mockReset();
  });

  it("rejects switching into a tenant the user does not belong to and audit-logs the attempt", async () => {
    findUniqueTenantUser.mockResolvedValue(null);

    await expect(switchTenant("karim-owner", "rahim-tenant")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "karim-owner", action: "access.denied.tenant_switch", resourceId: "rahim-tenant" })
    );
  });

  it("succeeds and logs tenant.switch for an actual member", async () => {
    findUniqueTenantUser.mockResolvedValue({ role: "TENANT_ADMIN", tenant: KARIM_TENANT });

    const result = await switchTenant("admin-1", "karim-tenant");
    expect(result.id).toBe("karim-tenant");
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "tenant.switch" }));
  });

  it("looks up membership scoped to (tenantId, userId) — cannot be satisfied by any other user's row", async () => {
    findUniqueTenantUser.mockResolvedValue({ role: "TENANT_OWNER", tenant: RAHIM_TENANT });
    await switchTenant("owner-1", "rahim-tenant");
    expect(findUniqueTenantUser).toHaveBeenCalledWith({
      where: { tenantId_userId: { tenantId: "rahim-tenant", userId: "owner-1" } },
      include: { tenant: true },
    });
  });
});

describe("listTenantMemberships", () => {
  it("returns every tenant the user belongs to, each with their role in that tenant", async () => {
    findManyTenantUser.mockResolvedValue([
      { role: "TENANT_OWNER", tenant: RAHIM_TENANT },
      { role: "TENANT_ADMIN", tenant: KARIM_TENANT },
    ]);

    const memberships = await listTenantMemberships("multi-tenant-user");
    expect(memberships).toHaveLength(2);
    expect(memberships[0]).toMatchObject({ tenantId: "rahim-tenant", role: "TENANT_OWNER" });
    expect(memberships[1]).toMatchObject({ tenantId: "karim-tenant", role: "TENANT_ADMIN" });
  });
});
