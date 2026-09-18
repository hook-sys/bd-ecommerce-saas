import { describe, it, expect, vi, beforeEach } from "vitest";

const requireFeature = vi.fn();
const isThemeEligibleForTenant = vi.fn();
const listPublishedThemesForTenant = vi.fn();
const listInstalledThemesForTenant = vi.fn();
const findTenantThemeById = vi.fn();
const findUniqueThemeVersion = vi.fn();
const upsertTenantTheme = vi.fn();
const updateTenantTheme = vi.fn();
const updateTenant = vi.fn();
const upsertTenantThemeSettings = vi.fn();
const transaction = vi.fn(async (ops: unknown[]) => ops);
const createAuditLog = vi.fn();

vi.mock("@/lib/server/features/feature-service", () => ({
  requireFeature: (...args: unknown[]) => requireFeature(...args),
}));

vi.mock("@/lib/server/repositories/theme-repository", () => ({
  isThemeEligibleForTenant: (...args: unknown[]) => isThemeEligibleForTenant(...args),
  listPublishedThemesForTenant: (...args: unknown[]) => listPublishedThemesForTenant(...args),
  listInstalledThemesForTenant: (...args: unknown[]) => listInstalledThemesForTenant(...args),
  findTenantThemeById: (...args: unknown[]) => findTenantThemeById(...args),
}));

vi.mock("@/lib/server/audit/audit-log-service", () => ({
  logAuditEvent: (...args: unknown[]) => createAuditLog(...args),
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    themeVersion: { findUnique: (...args: unknown[]) => findUniqueThemeVersion(...args) },
    tenantTheme: {
      upsert: (...args: unknown[]) => upsertTenantTheme(...args),
      update: (...args: unknown[]) => updateTenantTheme(...args),
    },
    tenant: { update: (...args: unknown[]) => updateTenant(...args) },
    tenantThemeSettings: { upsert: (...args: unknown[]) => upsertTenantThemeSettings(...args) },
    $transaction: (...args: unknown[]) => transaction(args[0] as unknown[]),
  },
}));

import { listEligibleThemes, installTheme, activateTheme, updateTenantThemeSettings } from "@/lib/server/services/tenant-theme-service";

const TENANT = { tenantId: "rahim-tenant", planId: "basic" };
const ACTOR = { id: "owner-1", role: "TENANT_OWNER" };

describe("Theme Library feature-flag gating", () => {
  beforeEach(() => {
    requireFeature.mockReset();
  });

  it("listEligibleThemes calls requireFeature('theme_library') before touching data", async () => {
    requireFeature.mockRejectedValue(Object.assign(new Error("off"), { code: "FEATURE_DISABLED" }));
    await expect(listEligibleThemes(TENANT)).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    expect(requireFeature).toHaveBeenCalledWith(TENANT.tenantId, TENANT.planId, "theme_library");
  });

  it("installTheme is blocked when theme_library is disabled for the tenant", async () => {
    requireFeature.mockRejectedValue(Object.assign(new Error("off"), { code: "FEATURE_DISABLED" }));
    await expect(
      installTheme(TENANT, { themeId: "t1", themeVersionId: "v1" }, ACTOR)
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
  });
});

describe("installTheme", () => {
  beforeEach(() => {
    requireFeature.mockReset().mockResolvedValue(undefined);
    isThemeEligibleForTenant.mockReset();
    findUniqueThemeVersion.mockReset();
    upsertTenantTheme.mockReset();
    createAuditLog.mockReset();
  });

  it("rejects installing a theme the tenant isn't eligible for", async () => {
    isThemeEligibleForTenant.mockResolvedValue(false);
    await expect(installTheme(TENANT, { themeId: "t1", themeVersionId: "v1" }, ACTOR)).rejects.toMatchObject({
      code: "THEME_NOT_ELIGIBLE",
    });
  });

  it("rejects installing a version that belongs to a different theme", async () => {
    isThemeEligibleForTenant.mockResolvedValue(true);
    findUniqueThemeVersion.mockResolvedValue({ id: "v1", themeId: "OTHER_THEME", status: "PUBLISHED" });
    await expect(installTheme(TENANT, { themeId: "t1", themeVersionId: "v1" }, ACTOR)).rejects.toMatchObject({
      code: "THEME_VERSION_NOT_FOUND",
    });
  });

  it("rejects installing (and therefore ever activating) a DRAFT version", async () => {
    isThemeEligibleForTenant.mockResolvedValue(true);
    findUniqueThemeVersion.mockResolvedValue({ id: "v1", themeId: "t1", status: "DRAFT" });
    await expect(installTheme(TENANT, { themeId: "t1", themeVersionId: "v1" }, ACTOR)).rejects.toMatchObject({
      code: "THEME_VERSION_NOT_FOUND",
    });
    expect(upsertTenantTheme).not.toHaveBeenCalled();
  });

  it("rejects installing (and therefore ever activating) an ARCHIVED version", async () => {
    isThemeEligibleForTenant.mockResolvedValue(true);
    findUniqueThemeVersion.mockResolvedValue({ id: "v1", themeId: "t1", status: "ARCHIVED" });
    await expect(installTheme(TENANT, { themeId: "t1", themeVersionId: "v1" }, ACTOR)).rejects.toMatchObject({
      code: "THEME_VERSION_NOT_FOUND",
    });
    expect(upsertTenantTheme).not.toHaveBeenCalled();
  });

  it("installs at INSTALLED status without activating (install/activate are separate actions)", async () => {
    isThemeEligibleForTenant.mockResolvedValue(true);
    findUniqueThemeVersion.mockResolvedValue({ id: "v1", themeId: "t1", status: "PUBLISHED" });
    upsertTenantTheme.mockResolvedValue({ id: "tt1", themeId: "t1" });

    await installTheme(TENANT, { themeId: "t1", themeVersionId: "v1" }, ACTOR);

    const call = upsertTenantTheme.mock.calls[0][0];
    expect(call.create.status).toBe("INSTALLED");
    expect(updateTenant).not.toHaveBeenCalled();
  });
});

describe("activateTheme", () => {
  beforeEach(() => {
    requireFeature.mockReset().mockResolvedValue(undefined);
    findTenantThemeById.mockReset();
    transaction.mockClear();
    createAuditLog.mockReset();
  });

  it("rejects activating a theme that isn't installed for this tenant", async () => {
    findTenantThemeById.mockResolvedValue(null);
    await expect(activateTheme(TENANT, "tt1", ACTOR)).rejects.toMatchObject({ code: "THEME_NOT_INSTALLED" });
  });

  it("activation flips Tenant.activeTenantThemeId and TenantTheme.status, nothing else", async () => {
    findTenantThemeById.mockResolvedValue({ id: "tt1", themeId: "t1", tenantId: TENANT.tenantId });

    await activateTheme(TENANT, "tt1", ACTOR);

    expect(transaction).toHaveBeenCalled();
    const ops = transaction.mock.calls[0][0];
    expect(ops).toHaveLength(2);
  });

  it("findTenantThemeById is called with the tenant's own id, so a foreign tenantThemeId can't be activated cross-tenant", async () => {
    findTenantThemeById.mockResolvedValue({ id: "tt1", themeId: "t1", tenantId: TENANT.tenantId });
    await activateTheme(TENANT, "tt1", ACTOR);
    expect(findTenantThemeById).toHaveBeenCalledWith("tt1", TENANT.tenantId);
  });
});

describe("updateTenantThemeSettings", () => {
  beforeEach(() => {
    requireFeature.mockReset().mockResolvedValue(undefined);
    findTenantThemeById.mockReset();
    upsertTenantThemeSettings.mockReset();
    createAuditLog.mockReset();
  });

  it("rejects customizing a theme that isn't installed for this tenant", async () => {
    findTenantThemeById.mockResolvedValue(null);
    await expect(
      updateTenantThemeSettings(TENANT, { tenantThemeId: "tt1", settings: { logo: "x" } }, ACTOR)
    ).rejects.toMatchObject({ code: "THEME_NOT_INSTALLED" });
  });

  it("blocks cross-tenant settings access: Karim's tenantThemeId is never resolvable under Rahim's tenant context", async () => {
    // findTenantThemeById is scoped by (tenantThemeId, tenantId) in the
    // repository — Karim's row simply doesn't exist when looked up under
    // Rahim's tenantId, regardless of what tenantThemeId the client sends.
    findTenantThemeById.mockResolvedValue(null);

    await expect(
      updateTenantThemeSettings(TENANT, { tenantThemeId: "karims-tenant-theme-id", settings: { logo: "hacked.png" } }, ACTOR)
    ).rejects.toMatchObject({ code: "THEME_NOT_INSTALLED" });

    expect(findTenantThemeById).toHaveBeenCalledWith("karims-tenant-theme-id", TENANT.tenantId);
    expect(upsertTenantThemeSettings).not.toHaveBeenCalled();
  });

  it("writes only to TenantThemeSettings, never to the global Theme/ThemeVersion tables", async () => {
    findTenantThemeById.mockResolvedValue({ id: "tt1", themeId: "t1", tenantId: TENANT.tenantId });
    upsertTenantThemeSettings.mockResolvedValue({ id: "settings-1" });

    await updateTenantThemeSettings(TENANT, { tenantThemeId: "tt1", settings: { logo: "new.png" } }, ACTOR);

    expect(upsertTenantThemeSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantThemeId: "tt1" },
        create: expect.objectContaining({ tenantId: TENANT.tenantId, tenantThemeId: "tt1" }),
      })
    );
  });
});
