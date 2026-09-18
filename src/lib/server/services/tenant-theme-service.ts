import "server-only";
import { prisma } from "@/lib/server/db/client";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { requireFeature } from "@/lib/server/features/feature-service";
import { logAuditEvent } from "@/lib/server/audit/audit-log-service";
import {
  isThemeEligibleForTenant,
  listPublishedThemesForTenant,
  listInstalledThemesForTenant,
  findTenantThemeById,
} from "@/lib/server/repositories/theme-repository";

const THEME_LIBRARY_FEATURE_KEY = "theme_library";

export interface TenantIdentity {
  tenantId: string;
  planId: string | null;
}

interface Actor {
  id: string;
  role: string;
}

// Every tenant-facing theme action starts by requiring the theme_library
// feature — the same FeatureService gate used everywhere else, so
// disabling the feature for a tenant blocks the Theme Library UI, theme
// installation, and direct API access identically (DEVELOPMENT_RULES.md #3).
async function requireThemeLibraryEnabled(tenant: TenantIdentity) {
  await requireFeature(tenant.tenantId, tenant.planId, THEME_LIBRARY_FEATURE_KEY);
}

export async function listEligibleThemes(tenant: TenantIdentity) {
  await requireThemeLibraryEnabled(tenant);
  return listPublishedThemesForTenant(tenant.tenantId, tenant.planId);
}

export async function listInstalledThemes(tenant: TenantIdentity) {
  await requireThemeLibraryEnabled(tenant);
  return listInstalledThemesForTenant(tenant.tenantId);
}

// Installing does not activate. It creates/updates the tenant's
// TenantTheme row at the requested version, leaving Tenant.activeThemeId
// untouched — matching the required "Install" / "Activate" split.
export async function installTheme(
  tenant: TenantIdentity,
  input: { themeId: string; themeVersionId: string },
  actor: Actor
) {
  await requireThemeLibraryEnabled(tenant);

  const eligible = await isThemeEligibleForTenant(input.themeId, tenant.tenantId, tenant.planId);
  if (!eligible) {
    throw new AppError("THEME_NOT_ELIGIBLE", "This theme is not available on your current plan.");
  }

  const version = await prisma.themeVersion.findUnique({ where: { id: input.themeVersionId } });
  if (!version || version.themeId !== input.themeId || version.status !== "PUBLISHED") {
    throw new AppError("THEME_VERSION_NOT_FOUND", "This theme version is not available.");
  }

  const tenantTheme = await prisma.tenantTheme.upsert({
    where: { tenantId_themeId: { tenantId: tenant.tenantId, themeId: input.themeId } },
    update: { themeVersionId: input.themeVersionId },
    create: {
      tenantId: tenant.tenantId,
      themeId: input.themeId,
      themeVersionId: input.themeVersionId,
      status: "INSTALLED",
    },
  });

  await logAuditEvent({
    actorId: actor.id,
    actorRole: actor.role,
    tenantId: tenant.tenantId,
    action: "theme.install",
    resourceType: "tenant_theme",
    resourceId: tenantTheme.id,
    metadata: { themeId: input.themeId, themeVersionId: input.themeVersionId },
  });

  return tenantTheme;
}

// The one action that actually changes the live storefront. Activating a
// theme flips Tenant.activeTenantThemeId — it never touches products,
// orders, customers, inventory, coupons, or reviews.
export async function activateTheme(tenant: TenantIdentity, tenantThemeId: string, actor: Actor) {
  await requireThemeLibraryEnabled(tenant);

  const tenantTheme = await findTenantThemeById(tenantThemeId, tenant.tenantId);
  if (!tenantTheme) {
    throw new AppError("THEME_NOT_INSTALLED", "Install this theme before activating it.");
  }

  await prisma.$transaction([
    prisma.tenantTheme.update({ where: { id: tenantThemeId }, data: { status: "ACTIVE", activatedAt: new Date() } }),
    prisma.tenant.update({ where: { id: tenant.tenantId }, data: { activeTenantThemeId: tenantThemeId } }),
  ]);

  await logAuditEvent({
    actorId: actor.id,
    actorRole: actor.role,
    tenantId: tenant.tenantId,
    action: "theme.activate",
    resourceType: "tenant_theme",
    resourceId: tenantThemeId,
    metadata: { themeId: tenantTheme.themeId },
  });
}

// Customization is stored per-installed-theme (TenantThemeSettings), so
// switching the active theme and back preserves prior customization, and
// nothing here ever writes to the global Theme/ThemeVersion record.
export async function updateTenantThemeSettings(
  tenant: TenantIdentity,
  input: { tenantThemeId: string; settings: Record<string, unknown> },
  actor: Actor
) {
  await requireThemeLibraryEnabled(tenant);

  const tenantTheme = await findTenantThemeById(input.tenantThemeId, tenant.tenantId);
  if (!tenantTheme) {
    throw new AppError("THEME_NOT_INSTALLED", "This theme is not installed for your store.");
  }

  const settingsJson = input.settings as Prisma.InputJsonValue;
  const settings = await prisma.tenantThemeSettings.upsert({
    where: { tenantThemeId: input.tenantThemeId },
    update: { settings: settingsJson },
    create: { tenantId: tenant.tenantId, tenantThemeId: input.tenantThemeId, settings: settingsJson },
  });

  await logAuditEvent({
    actorId: actor.id,
    actorRole: actor.role,
    tenantId: tenant.tenantId,
    action: "theme.settings.update",
    resourceType: "tenant_theme_settings",
    resourceId: settings.id,
  });

  return settings;
}
