import "server-only";
import { AppError } from "@/lib/errors/app-error";
import { requireFeature } from "@/lib/server/features/feature-service";
import { logAuditEvent } from "@/lib/server/audit/audit-log-service";
import { slugify } from "@/lib/server/tenant/hostname";
import {
  listCategoriesForTenant,
  findCategoryById,
  createCategoryRow,
  updateCategoryRow,
  reorderCategoryRows,
  categorySlugExists,
} from "@/lib/server/repositories/catalog-repository";
import type { CreateCategoryInput, UpdateCategoryInput } from "@/lib/validators/catalog";
import type { TenantIdentity } from "@/lib/server/services/product-service";

interface Actor {
  id: string;
  role: string;
}

const CATALOG_FEATURE_KEY = "product_catalog";
const MAX_SLUG_ATTEMPTS = 20;

async function requireCatalogFeature(tenant: TenantIdentity) {
  await requireFeature(tenant.tenantId, tenant.planId, CATALOG_FEATURE_KEY);
}

async function generateUniqueCategorySlug(tenantId: string, name: string, excludeId?: string): Promise<string> {
  const base = slugify(name) || "category";

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if (!(await categorySlugExists(tenantId, candidate, excludeId))) return candidate;
  }

  throw new AppError("SLUG_ALREADY_EXISTS", "Could not generate a unique category URL. Try a different name.");
}

export async function listCategories(tenant: TenantIdentity, params: { page: number; pageSize: number; status?: "DRAFT" | "ACTIVE" | "ARCHIVED" }) {
  await requireCatalogFeature(tenant);
  return listCategoriesForTenant({ tenantId: tenant.tenantId, ...params });
}

export async function getCategory(tenant: TenantIdentity, categoryId: string) {
  await requireCatalogFeature(tenant);
  const category = await findCategoryById(tenant.tenantId, categoryId);
  if (!category) throw new AppError("CATEGORY_NOT_FOUND", "Category not found.");
  return category;
}

export async function createCategory(tenant: TenantIdentity, input: CreateCategoryInput, actor: Actor) {
  await requireCatalogFeature(tenant);

  const slug = input.slug ?? (await generateUniqueCategorySlug(tenant.tenantId, input.name));
  if (input.slug && (await categorySlugExists(tenant.tenantId, input.slug))) {
    throw new AppError("SLUG_ALREADY_EXISTS", "A category with this URL already exists.");
  }

  const category = await createCategoryRow({
    tenant: { connect: { id: tenant.tenantId } },
    name: input.name,
    slug,
    description: input.description,
    image: input.image,
    status: input.status,
    sortOrder: input.sortOrder,
  });

  await logAuditEvent({
    actorId: actor.id,
    actorRole: actor.role,
    tenantId: tenant.tenantId,
    action: "category.created",
    resourceType: "category",
    resourceId: category.id,
  });

  return category;
}

export async function updateCategory(tenant: TenantIdentity, categoryId: string, input: UpdateCategoryInput, actor: Actor) {
  await requireCatalogFeature(tenant);

  const existing = await findCategoryById(tenant.tenantId, categoryId);
  if (!existing) throw new AppError("CATEGORY_NOT_FOUND", "Category not found.");

  let slug = existing.slug;
  if (input.slug && input.slug !== existing.slug) {
    if (await categorySlugExists(tenant.tenantId, input.slug, categoryId)) {
      throw new AppError("SLUG_ALREADY_EXISTS", "A category with this URL already exists.");
    }
    slug = input.slug;
  }

  const updated = await updateCategoryRow(tenant.tenantId, categoryId, {
    name: input.name,
    slug,
    description: input.description,
    image: input.image,
    status: input.status,
    sortOrder: input.sortOrder,
  });

  if (!updated) throw new AppError("CATEGORY_NOT_FOUND", "Category not found.");

  await logAuditEvent({
    actorId: actor.id,
    actorRole: actor.role,
    tenantId: tenant.tenantId,
    action: "category.updated",
    resourceType: "category",
    resourceId: categoryId,
  });

  return updated;
}

export async function setCategoryStatus(tenant: TenantIdentity, categoryId: string, status: "DRAFT" | "ACTIVE" | "ARCHIVED", actor: Actor) {
  await requireCatalogFeature(tenant);

  const updated = await updateCategoryRow(tenant.tenantId, categoryId, { status });
  if (!updated) throw new AppError("CATEGORY_NOT_FOUND", "Category not found.");

  await logAuditEvent({
    actorId: actor.id,
    actorRole: actor.role,
    tenantId: tenant.tenantId,
    action: status === "ARCHIVED" ? "category.archived" : status === "ACTIVE" ? "category.activated" : "category.updated",
    resourceType: "category",
    resourceId: categoryId,
    metadata: { status },
  });

  return updated;
}

export async function reorderCategories(tenant: TenantIdentity, orderedCategoryIds: string[], actor: Actor) {
  await requireCatalogFeature(tenant);

  const ok = await reorderCategoryRows(tenant.tenantId, orderedCategoryIds);
  if (!ok) throw new AppError("CATEGORY_NOT_FOUND", "One or more categories were not found.");

  await logAuditEvent({
    actorId: actor.id,
    actorRole: actor.role,
    tenantId: tenant.tenantId,
    action: "category.updated",
    resourceType: "category",
    metadata: { reordered: orderedCategoryIds.length },
  });
}
