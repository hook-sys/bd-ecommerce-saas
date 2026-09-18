import { describe, it, expect, vi, beforeEach } from "vitest";

const findUniqueTenant = vi.fn();
const findUniqueTenantTheme = vi.fn();

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    tenant: { findUnique: (...args: unknown[]) => findUniqueTenant(...args) },
    tenantTheme: { findUnique: (...args: unknown[]) => findUniqueTenantTheme(...args) },
  },
}));

// Import fresh per test file — React's cache() memoizes per-request in a
// real server, but within a single Vitest module instance it would also
// dedupe across test cases with different tenant ids, which is fine since
// they're different cache keys, but reset mocks explicitly regardless.
import { resolveStorefrontTheme, resolveSectionsForPage } from "@/lib/server/storefront/theme-runtime";

const VALID_CONTRACT = {
  metadata: { name: "Fashion Pro" },
  supportedPages: ["home"],
  components: [],
  sections: [],
  configurableSettings: [],
  designTokens: { colors: { primary: "#111827" }, fonts: {}, spacing: {}, radius: {}, buttons: {}, cards: {} },
  defaultLayouts: { home: [{ component: "Hero", props: { heading: "Welcome" } }] },
};

describe("resolveStorefrontTheme", () => {
  beforeEach(() => {
    findUniqueTenant.mockReset();
    findUniqueTenantTheme.mockReset();
  });

  it("returns no_active_theme when the tenant has never activated a theme (safe default state)", async () => {
    findUniqueTenant.mockResolvedValue({ activeTenantThemeId: null });
    const result = await resolveStorefrontTheme("tenant-no-theme");
    expect(result.status).toBe("no_active_theme");
  });

  it("resolves the active theme, version, and merged tenant settings", async () => {
    findUniqueTenant.mockResolvedValue({ activeTenantThemeId: "tt1" });
    findUniqueTenantTheme.mockResolvedValue({
      theme: { name: "Fashion Pro" },
      themeVersion: { version: "1.0.0", status: "PUBLISHED", contract: VALID_CONTRACT },
      settings: { settings: { designTokens: { colors: { primary: "#0000ff" } } } },
    });

    const result = await resolveStorefrontTheme("tenant-rahim");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.themeName).toBe("Fashion Pro");
    // Tenant override applied on top of the theme's default token.
    expect(result.cssVariables["--colors-primary"]).toBe("#0000ff");
  });

  it("falls back to theme defaults when the tenant hasn't customized settings", async () => {
    findUniqueTenant.mockResolvedValue({ activeTenantThemeId: "tt1" });
    findUniqueTenantTheme.mockResolvedValue({
      theme: { name: "Fashion Pro" },
      themeVersion: { version: "1.0.0", status: "PUBLISHED", contract: VALID_CONTRACT },
      settings: null,
    });

    const result = await resolveStorefrontTheme("tenant-karim");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.cssVariables["--colors-primary"]).toBe("#111827");
  });

  it("returns invalid_contract for a malformed contract rather than crashing", async () => {
    findUniqueTenant.mockResolvedValue({ activeTenantThemeId: "tt1" });
    findUniqueTenantTheme.mockResolvedValue({
      theme: { name: "Broken Theme" },
      themeVersion: { version: "1.0.0", status: "PUBLISHED", contract: { not: "a valid contract" } },
      settings: null,
    });

    const result = await resolveStorefrontTheme("tenant-broken-contract");
    expect(result.status).toBe("invalid_contract");
  });

  it("returns theme_not_found when the active pointer references a row that no longer resolves (data-integrity fallback)", async () => {
    findUniqueTenant.mockResolvedValue({ activeTenantThemeId: "dangling-id" });
    findUniqueTenantTheme.mockResolvedValue(null);

    const result = await resolveStorefrontTheme("tenant-dangling");
    expect(result.status).toBe("theme_not_found");
  });

  it("does not re-check themeVersion.status at render time — an active version stays rendered even if not PUBLISHED", async () => {
    findUniqueTenant.mockResolvedValue({ activeTenantThemeId: "tt1" });
    findUniqueTenantTheme.mockResolvedValue({
      theme: { name: "Fashion Pro" },
      themeVersion: { version: "1.0.0", status: "ARCHIVED", contract: VALID_CONTRACT },
      settings: null,
    });

    const result = await resolveStorefrontTheme("tenant-preserve-active");
    expect(result.status).toBe("ok");
  });
});

describe("resolveSectionsForPage", () => {
  it("uses the tenant's own layout override for a page when present", () => {
    const resolution = {
      status: "ok" as const,
      themeName: "x",
      themeVersionLabel: "1.0.0",
      contract: { ...VALID_CONTRACT, defaultLayouts: { home: [{ component: "Hero", props: {} }] } },
      tenantLayouts: { home: [{ component: "Banner", props: {} }] },
      cssVariables: {},
    };
    expect(resolveSectionsForPage(resolution, "home")).toEqual([{ component: "Banner", props: {} }]);
  });

  it("falls back to the theme's default layout when the tenant hasn't customized that page", () => {
    const resolution = {
      status: "ok" as const,
      themeName: "x",
      themeVersionLabel: "1.0.0",
      contract: { ...VALID_CONTRACT, defaultLayouts: { home: [{ component: "Hero", props: {} }] } },
      tenantLayouts: {},
      cssVariables: {},
    };
    expect(resolveSectionsForPage(resolution, "home")).toEqual([{ component: "Hero", props: {} }]);
  });

  it("returns an empty list (not a crash) for a page neither the tenant nor the theme has defined", () => {
    const resolution = {
      status: "ok" as const,
      themeName: "x",
      themeVersionLabel: "1.0.0",
      contract: { ...VALID_CONTRACT, defaultLayouts: {} },
      tenantLayouts: {},
      cssVariables: {},
    };
    expect(resolveSectionsForPage(resolution, "cart")).toEqual([]);
  });
});
