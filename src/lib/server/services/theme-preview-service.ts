import "server-only";
import { prisma } from "@/lib/server/db/client";
import { AppError } from "@/lib/errors/app-error";
import { requireFeature } from "@/lib/server/features/feature-service";
import { themeContractSchema, tenantThemeSettingsShapeSchema, type ThemeContract } from "@/lib/validators/theme";
import { mergeDesignTokens, tokensToCssVariables } from "@/lib/storefront/design-tokens";
import { isThemeEligibleForTenant } from "@/lib/server/repositories/theme-repository";

export interface PreviewRendering {
  themeName: string;
  themeStatus: string;
  themeVersionId: string;
  themeVersionLabel: string;
  themeVersionStatus: string;
  contract: ThemeContract;
  cssVariables: Record<string, string>;
}

async function buildPreviewRendering(
  theme: { id: string; name: string; status: string },
  themeVersion: { id: string; version: string; status: string; contract: unknown },
  tenantSettings: unknown
): Promise<PreviewRendering> {
  const parsedContract = themeContractSchema.safeParse(themeVersion.contract);
  if (!parsedContract.success) {
    throw new AppError("VALIDATION_ERROR", "This theme version has an invalid contract and cannot be previewed.");
  }

  const parsedSettings = tenantThemeSettingsShapeSchema.safeParse(tenantSettings ?? {});
  const tenantDesignTokens = parsedSettings.success ? parsedSettings.data.designTokens : undefined;
  const mergedTokens = mergeDesignTokens(parsedContract.data.designTokens, tenantDesignTokens);

  return {
    themeName: theme.name,
    themeStatus: theme.status,
    themeVersionId: themeVersion.id,
    themeVersionLabel: themeVersion.version,
    themeVersionStatus: themeVersion.status,
    contract: parsedContract.data,
    cssVariables: tokensToCssVariables(mergedTokens),
  };
}

// Super Admin may preview ANY theme in ANY status (including DRAFT/ARCHIVED
// and unpublished versions) — this is QA, not a customer-facing render, and
// the caller must already have passed requireSuperAdmin(). Defaults to the
// most recently created version if none is specified.
export async function getSuperAdminThemePreview(themeId: string, themeVersionId?: string): Promise<PreviewRendering> {
  const theme = await prisma.theme.findUnique({ where: { id: themeId } });
  if (!theme) throw new AppError("THEME_NOT_FOUND", "Theme not found.");

  const themeVersion = themeVersionId
    ? await prisma.themeVersion.findUnique({ where: { id: themeVersionId } })
    : await prisma.themeVersion.findFirst({ where: { themeId }, orderBy: { createdAt: "desc" } });

  if (!themeVersion || themeVersion.themeId !== themeId) {
    throw new AppError("THEME_VERSION_NOT_FOUND", "Theme version not found.");
  }

  return buildPreviewRendering(theme, themeVersion, {});
}

// Merchant preview: eligible if the theme is currently eligible for this
// tenant (same check installTheme uses) OR the tenant already has it
// installed — a merchant should still be able to preview/reconsider a
// theme they installed earlier even if platform visibility later narrowed.
// Only PUBLISHED versions are previewable here (DRAFT versions aren't
// merchant-facing) and the version must belong to the requested theme.
export async function getMerchantThemePreview(
  tenant: { tenantId: string; planId: string | null },
  themeId: string,
  themeVersionId: string | undefined
): Promise<PreviewRendering> {
  await requireFeature(tenant.tenantId, tenant.planId, "theme_library");

  const theme = await prisma.theme.findUnique({ where: { id: themeId } });
  if (!theme || theme.status !== "PUBLISHED") {
    throw new AppError("THEME_NOT_FOUND", "Theme not found.");
  }

  const [eligible, existingInstall] = await Promise.all([
    isThemeEligibleForTenant(themeId, tenant.tenantId, tenant.planId),
    prisma.tenantTheme.findUnique({ where: { tenantId_themeId: { tenantId: tenant.tenantId, themeId } } }),
  ]);

  if (!eligible && !existingInstall) {
    throw new AppError("THEME_NOT_ELIGIBLE", "This theme is not available on your current plan.");
  }

  const themeVersion = themeVersionId
    ? await prisma.themeVersion.findUnique({ where: { id: themeVersionId } })
    : await prisma.themeVersion.findFirst({ where: { themeId, status: "PUBLISHED" }, orderBy: { createdAt: "desc" } });

  if (!themeVersion || themeVersion.themeId !== themeId || themeVersion.status !== "PUBLISHED") {
    throw new AppError("THEME_VERSION_NOT_FOUND", "Theme version not found.");
  }

  // Use the merchant's own settings only if they've actually installed
  // this exact version — never another tenant's, and never a stale
  // settings blob from a different version's install record.
  const settingsRow =
    existingInstall && existingInstall.themeVersionId === themeVersion.id
      ? await prisma.tenantThemeSettings.findFirst({ where: { tenantThemeId: existingInstall.id } })
      : null;

  return buildPreviewRendering(theme, themeVersion, settingsRow?.settings ?? {});
}
