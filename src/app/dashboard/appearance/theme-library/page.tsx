import { getOptionalUser } from "@/lib/server/auth/require-role";
import { resolveDashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";
import { listEligibleThemes } from "@/lib/server/services/tenant-theme-service";
import { AppError } from "@/lib/errors/app-error";
import { ThemeLibraryList } from "@/app/dashboard/appearance/theme-library/theme-library-list";

export const dynamic = "force-dynamic";

// listEligibleThemes() itself calls requireFeature("theme_library") —
// disabled for this tenant means FEATURE_DISABLED here too, caught by
// src/app/dashboard/error.tsx, exactly like /dashboard/appearance.
export default async function ThemeLibraryPage() {
  const authUser = await getOptionalUser();
  const context = authUser ? await resolveDashboardTenantContext(authUser.id) : null;
  if (!authUser || !context) {
    throw new AppError("TENANT_NOT_FOUND", "No store found for this account.");
  }

  const themes = await listEligibleThemes({ tenantId: context.tenant.id, planId: context.tenant.planId });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Theme Library</h1>
      <ThemeLibraryList
        themes={themes.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          accessType: t.accessType,
          latestVersionId: t.versions[0]?.id ?? null,
        }))}
      />
    </div>
  );
}
