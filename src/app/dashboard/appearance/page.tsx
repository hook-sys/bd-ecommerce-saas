import Link from "next/link";
import { getOptionalUser } from "@/lib/server/auth/require-role";
import { resolveDashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";
import { getAppearanceData } from "@/lib/server/services/dashboard-service";
import { AppError } from "@/lib/errors/app-error";

// getAppearanceData() throws FEATURE_DISABLED (caught by
// src/app/dashboard/error.tsx) when theme_library isn't enabled for this
// tenant — the same check /api/dashboard/appearance makes, so direct URL
// access is blocked exactly like the nav link is hidden in the layout.
export default async function AppearancePage() {
  const authUser = await getOptionalUser();
  const context = authUser ? await resolveDashboardTenantContext(authUser.id) : null;
  if (!authUser || !context) {
    throw new AppError("TENANT_NOT_FOUND", "No store found for this account.");
  }

  await getAppearanceData(context);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Appearance</h1>
      <div className="flex gap-4 text-sm">
        <Link href="/dashboard/appearance/theme-library" className="underline">
          Theme Library
        </Link>
        <Link href="/dashboard/appearance/my-themes" className="underline">
          My Themes
        </Link>
      </div>
    </div>
  );
}
