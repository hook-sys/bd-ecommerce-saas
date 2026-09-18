import { requireSuperAdmin } from "@/lib/server/auth/require-role";
import { getSuperAdminThemePreview } from "@/lib/server/services/theme-preview-service";
import { PreviewFrame } from "@/lib/storefront/storefront-renderer";
import { AppError } from "@/lib/errors/app-error";

export const dynamic = "force-dynamic";

// Super Admin can preview any theme/version regardless of status — this is
// QA before publishing, not a customer-facing render, and never activates
// anything for any tenant.
export default async function SuperAdminThemePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ themeId: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  await requireSuperAdmin();
  const { themeId } = await params;
  const { version } = await searchParams;

  let preview;
  try {
    preview = await getSuperAdminThemePreview(themeId, version);
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
      bannerText={`Super Admin preview — ${preview.themeName} v${preview.themeVersionLabel} (${preview.themeVersionStatus})`}
      cssVariables={preview.cssVariables}
      globalSections={globalSections}
      homeSections={homeSections}
    />
  );
}
