import { getOptionalUser } from "@/lib/server/auth/require-role";
import { resolveDashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";
import { listInstalledThemes } from "@/lib/server/services/tenant-theme-service";
import { AppError } from "@/lib/errors/app-error";
import { MyThemesList } from "@/app/dashboard/appearance/my-themes/my-themes-list";

export const dynamic = "force-dynamic";

export default async function MyThemesPage() {
  const authUser = await getOptionalUser();
  const context = authUser ? await resolveDashboardTenantContext(authUser.id) : null;
  if (!authUser || !context) {
    throw new AppError("TENANT_NOT_FOUND", "No store found for this account.");
  }

  const installed = await listInstalledThemes({ tenantId: context.tenant.id, planId: context.tenant.planId });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">My Themes</h1>
      <MyThemesList
        items={installed.map((t) => ({
          tenantThemeId: t.id,
          themeId: t.themeId,
          themeName: t.theme.name,
          version: t.themeVersion.version,
          status: t.status,
        }))}
      />
    </div>
  );
}
