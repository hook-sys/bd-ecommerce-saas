import "server-only";
import { prisma } from "@/lib/server/db/client";
import { AppError } from "@/lib/errors/app-error";
import { requireFeature } from "@/lib/server/features/feature-service";
import { logAuditEvent } from "@/lib/server/audit/audit-log-service";
import { slugify } from "@/lib/server/tenant/hostname";
import {
  listProductsForTenant,
  findProductById,
  createProductRow,
  updateProductRow,
  replaceProductCategories,
  replaceProductImages,
  productSlugExists,
  skuExists,
} from "@/lib/server/repositories/catalog-repository";
import type { CreateProductInput, UpdateProductInput, CatalogListQuery } from "@/lib/validators/catalog";

export interface TenantIdentity {
  tenantId: string;
  planId: string | null;
}

interface Actor {
  id: string;
  role: string;
}

const CATALOG_FEATURE_KEY = "product_catalog";
const MAX_SLUG_ATTEMPTS = 20;

async function requireCatalogFeature(tenant: TenantIdentity) {
  await requireFeature(tenant.tenantId, tenant.planId, CATALOG_FEATURE_KEY);
}

// Tenant-scoped equivalent of TenantService.generateUniqueSlug — same
// collision-suffix strategy (-2, -3, ...), but scoped to (tenantId, slug)
// instead of global, because two different merchants are allowed to both
// have "/products/premium-shirt".
async function generateUniqueProductSlug(tenantId: string, name: string, excludeId?: string): Promise<string> {
  const base = slugify(name) || "product";

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if (!(await productSlugExists(tenantId, candidate, excludeId))) return candidate;
  }

  throw new AppError("SLUG_ALREADY_EXISTS", "Could not generate a unique product URL. Try a different name.");
}

export async function listProducts(tenant: TenantIdentity, query: CatalogListQuery) {
  await requireCatalogFeature(tenant);
  return listProductsForTenant({ tenantId: tenant.tenantId, page: query.page, pageSize: query.pageSize, status: query.status, q: query.q });
}

export async function getProduct(tenant: TenantIdentity, productId: string) {
  await requireCatalogFeature(tenant);
  const product = await findProductById(tenant.tenantId, productId);
  if (!product) throw new AppError("PRODUCT_NOT_FOUND", "Product not found.");
  return product;
}

export async function createProduct(tenant: TenantIdentity, input: CreateProductInput, actor: Actor) {
  await requireCatalogFeature(tenant);

  const slug = input.slug
    ? input.slug
    : await generateUniqueProductSlug(tenant.tenantId, input.name);

  if (input.slug && (await productSlugExists(tenant.tenantId, input.slug))) {
    throw new AppError("SLUG_ALREADY_EXISTS", "A product with this URL already exists.");
  }

  if (input.sku && (await skuExists(tenant.tenantId, input.sku))) {
    throw new AppError("SKU_ALREADY_EXISTS", "A product with this SKU already exists.");
  }

  // Cross-tenant defense-in-depth: even though categoryIds only ever come
  // from this tenant's own dashboard UI, verify every id actually belongs
  // to this tenant before linking — never trust a client-supplied id list
  // by itself.
  if (input.categoryIds.length) {
    const owned = await prisma.category.count({ where: { tenantId: tenant.tenantId, id: { in: input.categoryIds } } });
    if (owned !== input.categoryIds.length) {
      throw new AppError("CATEGORY_NOT_FOUND", "One or more categories were not found.");
    }
  }

  const product = await createProductRow({
    tenant: { connect: { id: tenant.tenantId } },
    name: input.name,
    slug,
    sku: input.sku,
    shortDescription: input.shortDescription,
    description: input.description,
    price: input.price,
    compareAtPrice: input.compareAtPrice,
    status: input.status,
    featured: input.featured,
  });

  if (input.categoryIds.length) {
    await replaceProductCategories(tenant.tenantId, product.id, input.categoryIds);
  }
  if (input.images.length) {
    await replaceProductImages(product.id, input.images);
  }

  await logAuditEvent({
    actorId: actor.id,
    actorRole: actor.role,
    tenantId: tenant.tenantId,
    action: "product.created",
    resourceType: "product",
    resourceId: product.id,
  });

  return getProduct(tenant, product.id);
}

export async function updateProduct(tenant: TenantIdentity, productId: string, input: UpdateProductInput, actor: Actor) {
  await requireCatalogFeature(tenant);

  const existing = await findProductById(tenant.tenantId, productId);
  if (!existing) throw new AppError("PRODUCT_NOT_FOUND", "Product not found.");

  let slug = existing.slug;
  if (input.slug && input.slug !== existing.slug) {
    if (await productSlugExists(tenant.tenantId, input.slug, productId)) {
      throw new AppError("SLUG_ALREADY_EXISTS", "A product with this URL already exists.");
    }
    slug = input.slug;
  }

  if (input.sku && input.sku !== existing.sku && (await skuExists(tenant.tenantId, input.sku, productId))) {
    throw new AppError("SKU_ALREADY_EXISTS", "A product with this SKU already exists.");
  }

  if (input.categoryIds) {
    const owned = await prisma.category.count({ where: { tenantId: tenant.tenantId, id: { in: input.categoryIds } } });
    if (owned !== input.categoryIds.length) {
      throw new AppError("CATEGORY_NOT_FOUND", "One or more categories were not found.");
    }
  }

  const updated = await updateProductRow(tenant.tenantId, productId, {
    name: input.name,
    slug,
    sku: input.sku,
    shortDescription: input.shortDescription,
    description: input.description,
    price: input.price,
    compareAtPrice: input.compareAtPrice,
    status: input.status,
    featured: input.featured,
  });

  if (!updated) throw new AppError("PRODUCT_NOT_FOUND", "Product not found.");

  if (input.categoryIds) {
    await replaceProductCategories(tenant.tenantId, productId, input.categoryIds);
  }
  if (input.images) {
    await replaceProductImages(productId, input.images);
  }

  await logAuditEvent({
    actorId: actor.id,
    actorRole: actor.role,
    tenantId: tenant.tenantId,
    action: "product.updated",
    resourceType: "product",
    resourceId: productId,
  });

  return getProduct(tenant, productId);
}

export async function setProductStatus(tenant: TenantIdentity, productId: string, status: "DRAFT" | "ACTIVE" | "ARCHIVED", actor: Actor) {
  await requireCatalogFeature(tenant);

  const updated = await updateProductRow(tenant.tenantId, productId, { status });
  if (!updated) throw new AppError("PRODUCT_NOT_FOUND", "Product not found.");

  await logAuditEvent({
    actorId: actor.id,
    actorRole: actor.role,
    tenantId: tenant.tenantId,
    action: status === "ACTIVE" ? "product.activated" : status === "ARCHIVED" ? "product.archived" : "product.updated",
    resourceType: "product",
    resourceId: productId,
    metadata: { status },
  });

  return updated;
}
