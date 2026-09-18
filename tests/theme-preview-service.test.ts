import { describe, it, expect, vi, beforeEach } from "vitest";

const findUniqueTheme = vi.fn();
const findUniqueThemeVersion = vi.fn();
const findFirstThemeVersion = vi.fn();
const findUniqueTenantTheme = vi.fn();
const findFirstTenantThemeSettings = vi.fn();
const requireFeature = vi.fn();
const isThemeEligibleForTenant = vi.fn();

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    theme: { findUnique: (...args: unknown[]) => findUniqueTheme(...args) },
    themeVersion: {
      findUnique: (...args: unknown[]) => findUniqueThemeVersion(...args),
      findFirst: (...args: unknown[]) => findFirstThemeVersion(...args),
    },
    tenantTheme: { findUnique: (...args: unknown[]) => findUniqueTenantTheme(...args) },
    tenantThemeSettings: { findFirst: (...args: unknown[]) => findFirstTenantThemeSettings(...args) },
  },
}));

vi.mock("@/lib/server/features/feature-service", () => ({
  requireFeature: (...args: unknown[]) => requireFeature(...args),
}));

vi.mock("@/lib/server/repositories/theme-repository", () => ({
  isThemeEligibleForTenant: (...args: unknown[]) => isThemeEligibleForTenant(...args),
}));

import { getSuperAdminThemePreview, getMerchantThemePreview } from "@/lib/server/services/theme-preview-service";

const CONTRACT = {
  metadata: { name: "x" },
  supportedPages: ["home"],
  components: [],
  sections: [],
  configurableSettings: [],
  designTokens: { colors: {}, fonts: {}, spacing: {}, radius: {}, buttons: {}, cards: {} },
  defaultLayouts: {},
};

describe("getSuperAdminThemePreview — can preview any status, any version", () => {
  beforeEach(() => {
    findUniqueTheme.mockReset();
    findUniqueThemeVersion.mockReset();
    findFirstThemeVersion.mockReset();
  });

  it("throws THEME_NOT_FOUND for an unknown theme", async () => {
    findUniqueTheme.mockResolvedValue(null);
    await expect(getSuperAdminThemePreview("missing")).rejects.toMatchObject({ code: "THEME_NOT_FOUND" });
  });

  it("previews a DRAFT theme's DRAFT version (QA before publishing)", async () => {
    findUniqueTheme.mockResolvedValue({ id: "t1", name: "Fashion Pro", status: "DRAFT" });
    findFirstThemeVersion.mockResolvedValue({ id: "v1", themeId: "t1", version: "1.0.0", status: "DRAFT", contract: CONTRACT });

    const preview = await getSuperAdminThemePreview("t1");
    expect(preview.themeVersionStatus).toBe("DRAFT");
  });

  it("rejects a version id that belongs to a different theme (defense against id mixups)", async () => {
    findUniqueTheme.mockResolvedValue({ id: "t1", name: "Fashion Pro", status: "PUBLISHED" });
    findUniqueThemeVersion.mockResolvedValue({ id: "v1", themeId: "OTHER_THEME", version: "1.0.0", status: "PUBLISHED", contract: CONTRACT });

    await expect(getSuperAdminThemePreview("t1", "v1")).rejects.toMatchObject({ code: "THEME_VERSION_NOT_FOUND" });
  });
});

describe("getMerchantThemePreview — eligibility + published-only, security-critical", () => {
  beforeEach(() => {
    findUniqueTheme.mockReset();
    findUniqueThemeVersion.mockReset();
    findFirstThemeVersion.mockReset();
    findUniqueTenantTheme.mockReset();
    findFirstTenantThemeSettings.mockReset();
    requireFeature.mockReset().mockResolvedValue(undefined);
    isThemeEligibleForTenant.mockReset();
  });

  it("blocks preview when theme_library is disabled for the tenant", async () => {
    requireFeature.mockRejectedValue(Object.assign(new Error("off"), { code: "FEATURE_DISABLED" }));
    await expect(
      getMerchantThemePreview({ tenantId: "t1", planId: "basic" }, "theme-1", undefined)
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
  });

  it("blocks preview of a theme the tenant is neither eligible for nor has installed (VIP theme, wrong tenant)", async () => {
    findUniqueTheme.mockResolvedValue({ id: "vip-theme", name: "VIP Fashion", status: "PUBLISHED" });
    isThemeEligibleForTenant.mockResolvedValue(false);
    findUniqueTenantTheme.mockResolvedValue(null);

    await expect(
      getMerchantThemePreview({ tenantId: "karim-tenant", planId: "basic" }, "vip-theme", undefined)
    ).rejects.toMatchObject({ code: "THEME_NOT_ELIGIBLE" });
  });

  it("allows preview when eligible even without installing first", async () => {
    findUniqueTheme.mockResolvedValue({ id: "t1", name: "Fashion Pro", status: "PUBLISHED" });
    isThemeEligibleForTenant.mockResolvedValue(true);
    findUniqueTenantTheme.mockResolvedValue(null);
    findFirstThemeVersion.mockResolvedValue({ id: "v1", themeId: "t1", version: "1.0.0", status: "PUBLISHED", contract: CONTRACT });

    const preview = await getMerchantThemePreview({ tenantId: "rahim-tenant", planId: "basic" }, "t1", undefined);
    expect(preview.themeName).toBe("Fashion Pro");
    expect(findFirstTenantThemeSettings).not.toHaveBeenCalled();
  });

  it("allows preview of an already-installed theme even if no longer eligible by current visibility rules", async () => {
    findUniqueTheme.mockResolvedValue({ id: "t1", name: "Fashion Pro", status: "PUBLISHED" });
    isThemeEligibleForTenant.mockResolvedValue(false);
    findUniqueTenantTheme.mockResolvedValue({ id: "tt1", tenantId: "rahim-tenant", themeId: "t1", themeVersionId: "v1" });
    findFirstThemeVersion.mockResolvedValue({ id: "v1", themeId: "t1", version: "1.0.0", status: "PUBLISHED", contract: CONTRACT });
    findFirstTenantThemeSettings.mockResolvedValue({ settings: { designTokens: {} } });

    const preview = await getMerchantThemePreview({ tenantId: "rahim-tenant", planId: "basic" }, "t1", undefined);
    expect(preview.themeName).toBe("Fashion Pro");
    // Uses the merchant's own settings since it's their installed version.
    expect(findFirstTenantThemeSettings).toHaveBeenCalledWith({ where: { tenantThemeId: "tt1" } });
  });

  it("never uses another tenant's settings — install lookup is scoped by (tenantId, themeId)", async () => {
    findUniqueTheme.mockResolvedValue({ id: "t1", name: "Fashion Pro", status: "PUBLISHED" });
    isThemeEligibleForTenant.mockResolvedValue(true);
    findUniqueTenantTheme.mockResolvedValue(null); // this tenant has no install row
    findFirstThemeVersion.mockResolvedValue({ id: "v1", themeId: "t1", version: "1.0.0", status: "PUBLISHED", contract: CONTRACT });

    await getMerchantThemePreview({ tenantId: "karim-tenant", planId: "pro" }, "t1", undefined);

    expect(findUniqueTenantTheme).toHaveBeenCalledWith({
      where: { tenantId_themeId: { tenantId: "karim-tenant", themeId: "t1" } },
    });
    expect(findFirstTenantThemeSettings).not.toHaveBeenCalled();
  });

  it("rejects a DRAFT version for merchant preview (not merchant-facing)", async () => {
    findUniqueTheme.mockResolvedValue({ id: "t1", name: "Fashion Pro", status: "PUBLISHED" });
    isThemeEligibleForTenant.mockResolvedValue(true);
    findUniqueTenantTheme.mockResolvedValue(null);
    findUniqueThemeVersion.mockResolvedValue({ id: "v-draft", themeId: "t1", version: "2.0.0", status: "DRAFT", contract: CONTRACT });

    await expect(
      getMerchantThemePreview({ tenantId: "rahim-tenant", planId: "basic" }, "t1", "v-draft")
    ).rejects.toMatchObject({ code: "THEME_VERSION_NOT_FOUND" });
  });
});
