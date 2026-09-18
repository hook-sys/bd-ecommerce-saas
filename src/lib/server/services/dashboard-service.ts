import "server-only";
import { prisma } from "@/lib/server/db/client";
import { requireFeature } from "@/lib/server/features/feature-service";
import type { DashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";

export interface DashboardSummary {
  storeName: string;
  storeSlug: string;
  tenantStatus: string;
  subscriptionStatus: string | null;
  planName: string | null;
  activeThemeName: string | null;
}

export async function getDashboardSummary(context: DashboardTenantContext): Promise<DashboardSummary> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: context.tenant.id },
    include: {
      plan: true,
      subscription: true,
      activeTenantTheme: { include: { theme: true } },
    },
  });

  return {
    storeName: context.tenant.name,
    storeSlug: context.tenant.slug,
    tenantStatus: context.tenant.status,
    subscriptionStatus: tenant?.subscription?.status ?? null,
    planName: tenant?.plan?.name ?? null,
    activeThemeName: tenant?.activeTenantTheme?.theme.name ?? null,
  };
}

// Shared by the /dashboard/appearance page and the /api/dashboard/appearance
// route so the feature gate is enforced identically in both places — one
// function, one decision, per DEVELOPMENT_RULES.md #3.
export async function getAppearanceData(context: DashboardTenantContext) {
  await requireFeature(context.tenant.id, context.tenant.planId, "theme_library");

  return {
    tenantId: context.tenant.id,
    themeLibraryEnabled: true as const,
  };
}
