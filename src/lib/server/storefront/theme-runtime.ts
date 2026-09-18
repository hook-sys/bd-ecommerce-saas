import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/server/db/client";
import {
  themeContractSchema,
  tenantThemeSettingsShapeSchema,
  type ThemeContract,
  type SectionInstance,
} from "@/lib/validators/theme";
import { mergeDesignTokens, tokensToCssVariables } from "@/lib/storefront/design-tokens";

// The runtime pipeline described in ARCHITECTURE.md:
//   Tenant -> Tenant.activeTenantThemeId -> TenantTheme -> ThemeVersion (contract)
//         -> TenantThemeSettings -> merged design tokens -> render
//
// Every failure mode here is a *data* state, not a thrown error — a
// storefront must never show a stack trace to a customer. Callers render a
// small dedicated screen per status; see src/app/storefront/[tenant]/layout.tsx.
export type StorefrontThemeResolution =
  | { status: "no_active_theme" }
  | { status: "theme_not_found" }
  | { status: "invalid_contract" }
  | {
      status: "ok";
      themeName: string;
      themeVersionLabel: string;
      contract: ThemeContract;
      tenantLayouts: Record<string, SectionInstance[]>;
      cssVariables: Record<string, string>;
    };

// React's cache() dedupes this per request — the layout and every page
// under it can each call resolveStorefrontTheme(tenantId) without adding
// extra round trips to the database (Phase 3 rule: avoid unnecessary
// queries at storefront-resolution volume).
export const resolveStorefrontTheme = cache(async (tenantId: string): Promise<StorefrontThemeResolution> => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { activeTenantThemeId: true },
  });

  if (!tenant?.activeTenantThemeId) {
    return { status: "no_active_theme" };
  }

  const tenantTheme = await prisma.tenantTheme.findUnique({
    where: { id: tenant.activeTenantThemeId },
    include: { theme: true, themeVersion: true, settings: true },
  });

  // Data-integrity fallback only — TenantTheme/ThemeVersion rows are never
  // deleted, and activation always points at a real row. If this ever
  // happens, the safe move is "no theme," not a crash.
  if (!tenantTheme || !tenantTheme.themeVersion) {
    return { status: "theme_not_found" };
  }

  // Deliberately NOT re-checking themeVersion.status === "PUBLISHED" here.
  // Versions are immutable once published and are never unpublished
  // individually — only install/activate are gated on PUBLISHED (see
  // tenant-theme-service.ts). Rendering always trusts whatever version is
  // currently pointed to, so an already-active storefront can't be broken
  // by a later platform-side theme change (DEVELOPMENT_RULES.md: "preserve
  // the currently active version").
  const parsedContract = themeContractSchema.safeParse(tenantTheme.themeVersion.contract);
  if (!parsedContract.success) {
    return { status: "invalid_contract" };
  }

  const parsedSettings = tenantThemeSettingsShapeSchema.safeParse(tenantTheme.settings?.settings ?? {});
  const tenantSettings = parsedSettings.success ? parsedSettings.data : {};

  const mergedTokens = mergeDesignTokens(parsedContract.data.designTokens, tenantSettings.designTokens);

  return {
    status: "ok",
    themeName: tenantTheme.theme.name,
    themeVersionLabel: tenantTheme.themeVersion.version,
    contract: parsedContract.data,
    tenantLayouts: tenantSettings.layouts ?? {},
    cssVariables: tokensToCssVariables(mergedTokens),
  };
});

// Resolves the section list for one page: tenant's own layout override for
// that page if they've set one, else the theme's own default arrangement,
// else nothing (an empty page body is safe; it is never a crash).
export function resolveSectionsForPage(resolution: Extract<StorefrontThemeResolution, { status: "ok" }>, page: string) {
  const tenantOverride = resolution.tenantLayouts[page];
  if (Array.isArray(tenantOverride)) return tenantOverride;
  return resolution.contract.defaultLayouts[page] ?? [];
}
