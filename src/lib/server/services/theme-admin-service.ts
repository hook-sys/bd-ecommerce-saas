import "server-only";
import { prisma } from "@/lib/server/db/client";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { logAuditEvent } from "@/lib/server/audit/audit-log-service";
import { slugify } from "@/lib/server/tenant/hostname";
import type { z } from "zod";
import type { createThemeSchema, createThemeVersionSchema, setThemeVisibilitySchema } from "@/lib/validators/theme";

type CreateThemeInput = z.infer<typeof createThemeSchema>;
type CreateThemeVersionInput = z.infer<typeof createThemeVersionSchema>;
type SetThemeVisibilityInput = z.infer<typeof setThemeVisibilitySchema>;

// Every function here is a platform-level (global) mutation and must only
// ever be called after requireSuperAdmin() has already run in the calling
// route handler/server action — this module does not re-check the role
// itself so it stays a pure service, but every export mutates global Theme
// data, never tenant data. See DEVELOPMENT_RULES.md #7 for why the
// authorization check still belongs in the route layer, not duplicated here.

export async function createTheme(input: CreateThemeInput, actorId: string) {
  const slug = slugify(input.name);
  const theme = await prisma.theme.create({
    data: {
      name: input.name,
      slug,
      description: input.description,
      category: input.category,
      thumbnailUrl: input.thumbnailUrl,
      accessType: input.accessType,
      status: "DRAFT",
    },
  });

  await logAuditEvent({
    actorId,
    actorRole: "SUPER_ADMIN",
    action: "theme.create",
    resourceType: "theme",
    resourceId: theme.id,
    metadata: { slug: theme.slug },
  });

  return theme;
}

// Versions are immutable once PUBLISHED. A theme update is always a new
// ThemeVersion row — this function never mutates an existing published
// version's contract/package, which is what keeps a merchant on an older
// version stable while Super Admin iterates on the theme.
export async function createThemeVersion(input: CreateThemeVersionInput, actorId: string) {
  const theme = await prisma.theme.findUnique({ where: { id: input.themeId } });
  if (!theme) throw new AppError("THEME_NOT_FOUND", "Theme not found.");

  const version = await prisma.themeVersion.create({
    data: {
      themeId: input.themeId,
      version: input.version,
      contract: input.contract as unknown as Prisma.InputJsonValue,
      packagePath: input.packagePath,
      previewImageUrl: input.previewImageUrl,
      changelog: input.changelog,
      status: "DRAFT",
    },
  });

  await logAuditEvent({
    actorId,
    actorRole: "SUPER_ADMIN",
    action: "theme.version.create",
    resourceType: "theme_version",
    resourceId: version.id,
    metadata: { themeId: input.themeId, version: input.version },
  });

  return version;
}

export async function publishThemeVersion(themeVersionId: string, actorId: string) {
  const version = await prisma.themeVersion.findUnique({ where: { id: themeVersionId } });
  if (!version) throw new AppError("THEME_VERSION_NOT_FOUND", "Theme version not found.");
  if (version.status === "PUBLISHED") {
    throw new AppError("THEME_VERSION_IMMUTABLE", "This version is already published and cannot be republished.");
  }

  const [updatedVersion] = await prisma.$transaction([
    prisma.themeVersion.update({
      where: { id: themeVersionId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    }),
    prisma.theme.update({ where: { id: version.themeId }, data: { status: "PUBLISHED" } }),
  ]);

  await logAuditEvent({
    actorId,
    actorRole: "SUPER_ADMIN",
    action: "theme.version.publish",
    resourceType: "theme_version",
    resourceId: themeVersionId,
    metadata: { themeId: version.themeId, version: version.version },
  });

  return updatedVersion;
}

export async function unpublishTheme(themeId: string, actorId: string) {
  const theme = await prisma.theme.findUnique({ where: { id: themeId } });
  if (!theme) throw new AppError("THEME_NOT_FOUND", "Theme not found.");

  const updated = await prisma.theme.update({ where: { id: themeId }, data: { status: "UNPUBLISHED" } });

  await logAuditEvent({
    actorId,
    actorRole: "SUPER_ADMIN",
    action: "theme.unpublish",
    resourceType: "theme",
    resourceId: themeId,
  });

  return updated;
}

export async function archiveTheme(themeId: string, actorId: string) {
  const theme = await prisma.theme.findUnique({ where: { id: themeId } });
  if (!theme) throw new AppError("THEME_NOT_FOUND", "Theme not found.");

  const updated = await prisma.theme.update({ where: { id: themeId }, data: { status: "ARCHIVED" } });

  await logAuditEvent({
    actorId,
    actorRole: "SUPER_ADMIN",
    action: "theme.archive",
    resourceType: "theme",
    resourceId: themeId,
  });

  return updated;
}

// Replaces the visibility configuration for a theme wholesale — simpler and
// less error-prone than diffing add/remove sets for what is an
// infrequent Super Admin action.
export async function setThemeVisibility(input: SetThemeVisibilityInput, actorId: string) {
  const theme = await prisma.theme.findUnique({ where: { id: input.themeId } });
  if (!theme) throw new AppError("THEME_NOT_FOUND", "Theme not found.");

  await prisma.$transaction(async (tx) => {
    await tx.theme.update({ where: { id: input.themeId }, data: { visibilityType: input.visibilityType } });
    await tx.themePlanVisibility.deleteMany({ where: { themeId: input.themeId } });
    await tx.themeTenantVisibility.deleteMany({ where: { themeId: input.themeId } });

    if (input.visibilityType === "SELECTED_PLANS" && input.planIds?.length) {
      await tx.themePlanVisibility.createMany({
        data: input.planIds.map((planId) => ({ themeId: input.themeId, planId })),
      });
    }

    if (input.visibilityType === "SELECTED_TENANTS" && input.tenantIds?.length) {
      await tx.themeTenantVisibility.createMany({
        data: input.tenantIds.map((tenantId) => ({ themeId: input.themeId, tenantId })),
      });
    }
  });

  await logAuditEvent({
    actorId,
    actorRole: "SUPER_ADMIN",
    action: "theme.visibility.set",
    resourceType: "theme",
    resourceId: input.themeId,
    metadata: { visibilityType: input.visibilityType, planIds: input.planIds, tenantIds: input.tenantIds },
  });
}
