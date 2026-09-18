import { getOptionalUser } from "@/lib/server/auth/require-role";
import { resolveDashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";
import { getMerchantThemePreview } from "@/lib/server/services/theme-preview-service";
import { PreviewFrame } from "@/lib/storefront/storefront-renderer";
import { AppError } from "@/lib/errors/app-error";

export const dynamic = "force-dynamic";

// Merchant preview: eligible-or-installed only, published versions only —
// see getMerchantThemePreview. Never changes the tenant's active theme.
export default async function MerchantThemePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ themeId: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const authUser = await getOptionalUser();
  const context = authUser ? await resolveDashboardTenantContext(authUser.id) : null;
  if (!authUser || !context) {
    throw new AppError("TENANT_NOT_FOUND", "No store found for this account.");
  }

  const { themeId } = await params;
  const { version } = await searchParams;

  let preview;
  try {
    preview = await getMerchantThemePreview(
      { tenantId: context.tenant.id, planId: context.tenant.planId },
      themeId,
      version
    );
  } catch (error) {
    if (error instanceof AppError) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
          <h1 className="text-xl font-bold">Preview unavailable</h1>
          <p className="text-neutral-600">{error.message}</p>
        </main>
      );
    }
    throw error;
  }

  const globalSections = preview.contract.defaultLayouts.global ?? [];
  const homeSections = preview.contract.defaultLayouts.home ?? [];

  return (
    <PreviewFrame
      bannerText={`Preview — ${preview.themeName} v${preview.themeVersionLabel} (not live yet)`}
      cssVariables={preview.cssVariables}
      globalSections={globalSections}
      homeSections={homeSections}
    />
  );
}
