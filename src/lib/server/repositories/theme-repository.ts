import { prisma } from "@/lib/server/db/client";
import type { Prisma } from "@prisma/client";

// Theme / ThemeVersion / ThemeAsset are global platform data — these
// queries are intentionally not tenant-scoped. TenantTheme and
// TenantThemeSettings queries below always take a tenantId, following the
// same repository convention as the rest of the app.

export function findThemeById(themeId: string) {
  return prisma.theme.findUnique({ where: { id: themeId } });
}

export function findThemeVersionById(themeVersionId: string) {
  return prisma.themeVersion.findUnique({ where: { id: themeVersionId }, include: { theme: true } });
}

export function listPublishedThemesForTenant(tenantId: string, planId: string | null) {
  const eligibilityClauses: Prisma.ThemeWhereInput[] = [
    { visibilityType: "ALL" },
    { visibilityType: "SELECTED_TENANTS", tenantVisibilities: { some: { tenantId } } },
  ];
  if (planId) {
    eligibilityClauses.push({ visibilityType: "SELECTED_PLANS", planVisibilities: { some: { planId } } });
  }

  return prisma.theme.findMany({
    where: {
      status: "PUBLISHED",
      OR: eligibilityClauses,
    },
    include: {
      versions: { where: { status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function isThemeEligibleForTenant(themeId: string, tenantId: string, planId: string | null): Promise<boolean> {
  const theme = await prisma.theme.findUnique({
    where: { id: themeId },
    select: {
      status: true,
      visibilityType: true,
      planVisibilities: planId ? { where: { planId }, select: { id: true } } : false,
      tenantVisibilities: { where: { tenantId }, select: { id: true } },
    },
  });

  if (!theme || theme.status !== "PUBLISHED") return false;
  if (theme.visibilityType === "ALL") return true;
  if (theme.visibilityType === "SELECTED_PLANS") return (theme.planVisibilities?.length ?? 0) > 0;
  if (theme.visibilityType === "SELECTED_TENANTS") return theme.tenantVisibilities.length > 0;
  return false;
}

export function findTenantThemeByTenantAndTheme(tenantId: string, themeId: string) {
  return prisma.tenantTheme.findUnique({ where: { tenantId_themeId: { tenantId, themeId } } });
}

export function findTenantThemeById(tenantThemeId: string, tenantId: string) {
  // Scoped by tenantId even though id alone is unique — the caller must
  // never be able to fetch (and therefore act on) another tenant's install
  // record by guessing/reusing an id.
  return prisma.tenantTheme.findFirst({
    where: { id: tenantThemeId, tenantId },
    include: { theme: true, themeVersion: true, settings: true },
  });
}

export function listInstalledThemesForTenant(tenantId: string) {
  return prisma.tenantTheme.findMany({
    where: { tenantId },
    include: { theme: true, themeVersion: true },
    orderBy: { installedAt: "desc" },
  });
}

export function findTenantThemeSettings(tenantThemeId: string, tenantId: string) {
  return prisma.tenantThemeSettings.findFirst({ where: { tenantThemeId, tenantId } });
}
