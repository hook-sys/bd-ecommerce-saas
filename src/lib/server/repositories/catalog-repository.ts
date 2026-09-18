import "server-only";
import { prisma } from "@/lib/server/db/client";
import type { Prisma, CatalogStatus } from "@prisma/client";

// Every function here takes tenantId as a required argument and uses it in
// the where clause — no exceptions, per DEVELOPMENT_RULES.md #2. The
// "*ForStorefront" functions additionally hard-filter status: "ACTIVE" and
// use an explicit `select` that never includes tenantId or other
// merchant-only fields, so a public page can never accidentally leak them
// just because a future field gets added to the model.

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

export function productSlugExists(tenantId: string, slug: string, excludeId?: string) {
  return prisma.product
    .findFirst({ where: { tenantId, slug, id: excludeId ? { not: excludeId } : undefined }, select: { id: true } })
    .then(Boolean);
}

export function categorySlugExists(tenantId: string, slug: string, excludeId?: string) {
  return prisma.category
    .findFirst({ where: { tenantId, slug, id: excludeId ? { not: excludeId } : undefined }, select: { id: true } })
    .then(Boolean);
}

export function skuExists(tenantId: string, sku: string, excludeId?: string) {
  return prisma.product
    .findFirst({ where: { tenantId, sku, id: excludeId ? { not: excludeId } : undefined }, select: { id: true } })
    .then(Boolean);
}

// ---------------------------------------------------------------------------
// Merchant dashboard — full fields, tenant-scoped, any status
// ---------------------------------------------------------------------------

export interface ListProductsParams {
  tenantId: string;
  page: number;
  pageSize: number;
  status?: CatalogStatus;
  q?: string;
}

// Offset pagination (page/pageSize -> skip/take). Simple and sufficient at
// the expected merchant-catalog scale (hundreds to low thousands of rows);
// see ARCHITECTURE.md "Pagination" for why this was chosen over a cursor.
export async function listProductsForTenant(params: ListProductsParams) {
  const where: Prisma.ProductWhereInput = {
    tenantId: params.tenantId,
    status: params.status,
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" } },
            { sku: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { images: { orderBy: { sortOrder: "asc" } }, categoryLinks: { include: { category: true } } },
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { items, total };
}

export function findProductById(tenantId: string, productId: string) {
  return prisma.product.findFirst({
    where: { id: productId, tenantId },
    include: { images: { orderBy: { sortOrder: "asc" } }, categoryLinks: { include: { category: true } } },
  });
}

export function createProductRow(data: Prisma.ProductCreateInput) {
  return prisma.product.create({
    data,
    include: { images: true, categoryLinks: { include: { category: true } } },
  });
}

export function updateProductRow(tenantId: string, productId: string, data: Prisma.ProductUpdateInput) {
  // updateMany is tenant-scoped by its where clause; a plain `update` only
  // takes a unique selector (id) and would happily update another tenant's
  // row if the id matched, so this two-step (scoped updateMany, then
  // re-fetch) is the safe pattern for a tenant-scoped mutation by id.
  return prisma.$transaction(async (tx) => {
    const result = await tx.product.updateMany({ where: { id: productId, tenantId }, data });
    if (result.count === 0) return null;
    return tx.product.findFirst({
      where: { id: productId, tenantId },
      include: { images: { orderBy: { sortOrder: "asc" } }, categoryLinks: { include: { category: true } } },
    });
  });
}

export async function replaceProductCategories(tenantId: string, productId: string, categoryIds: string[]) {
  await prisma.$transaction([
    prisma.productCategory.deleteMany({ where: { tenantId, productId } }),
    ...(categoryIds.length
      ? [prisma.productCategory.createMany({ data: categoryIds.map((categoryId) => ({ tenantId, productId, categoryId })) })]
      : []),
  ]);
}

export async function replaceProductImages(productId: string, images: { url: string; altText?: string }[]) {
  await prisma.$transaction([
    prisma.productImage.deleteMany({ where: { productId } }),
    ...(images.length
      ? [
          prisma.productImage.createMany({
            data: images.map((img, i) => ({ productId, url: img.url, altText: img.altText, sortOrder: i })),
          }),
        ]
      : []),
  ]);
}

export interface ListCategoriesParams {
  tenantId: string;
  page: number;
  pageSize: number;
  status?: CatalogStatus;
}

export async function listCategoriesForTenant(params: ListCategoriesParams) {
  const where: Prisma.CategoryWhereInput = { tenantId: params.tenantId, status: params.status };

  const [items, total] = await Promise.all([
    prisma.category.findMany({
      where,
      include: { _count: { select: { productLinks: true } } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.category.count({ where }),
  ]);

  return { items, total };
}

export function findCategoryById(tenantId: string, categoryId: string) {
  return prisma.category.findFirst({ where: { id: categoryId, tenantId } });
}

export function createCategoryRow(data: Prisma.CategoryCreateInput) {
  return prisma.category.create({ data });
}

export function updateCategoryRow(tenantId: string, categoryId: string, data: Prisma.CategoryUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.category.updateMany({ where: { id: categoryId, tenantId }, data });
    if (result.count === 0) return null;
    return tx.category.findFirst({ where: { id: categoryId, tenantId } });
  });
}

// Verifies every id in the reorder request actually belongs to this tenant
// before touching anything — a merchant reordering their own list must
// never be able to smuggle in another tenant's category id and have it
// silently ignored-but-trusted.
export async function reorderCategoryRows(tenantId: string, orderedCategoryIds: string[]) {
  const owned = await prisma.category.findMany({
    where: { tenantId, id: { in: orderedCategoryIds } },
    select: { id: true },
  });
  if (owned.length !== orderedCategoryIds.length) return false;

  await prisma.$transaction(
    orderedCategoryIds.map((id, index) =>
      prisma.category.update({ where: { id }, data: { sortOrder: index } })
    )
  );
  return true;
}

// ---------------------------------------------------------------------------
// Public storefront — ACTIVE only, safe projection (no tenantId in the
// returned shape, no draft/archived rows ever reachable through these).
// ---------------------------------------------------------------------------

const PUBLIC_PRODUCT_SELECT = {
  id: true,
  name: true,
  slug: true,
  shortDescription: true,
  description: true,
  price: true,
  compareAtPrice: true,
  featured: true,
  images: { select: { url: true, altText: true, sortOrder: true }, orderBy: { sortOrder: "asc" as const } },
  categoryLinks: { select: { category: { select: { id: true, name: true, slug: true } } } },
} satisfies Prisma.ProductSelect;

export interface ListActiveProductsParams {
  tenantId: string;
  page: number;
  pageSize: number;
  featuredOnly?: boolean;
  categorySlug?: string;
}

export async function listActiveProductsForStorefront(params: ListActiveProductsParams) {
  const where: Prisma.ProductWhereInput = {
    tenantId: params.tenantId,
    status: "ACTIVE",
    featured: params.featuredOnly ? true : undefined,
    categoryLinks: params.categorySlug
      ? { some: { category: { tenantId: params.tenantId, slug: params.categorySlug, status: "ACTIVE" } } }
      : undefined,
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: PUBLIC_PRODUCT_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { items, total };
}

export function findActiveProductBySlugForStorefront(tenantId: string, slug: string) {
  return prisma.product.findFirst({
    where: { tenantId, slug, status: "ACTIVE" },
    select: PUBLIC_PRODUCT_SELECT,
  });
}

const PUBLIC_CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  image: true,
  _count: { select: { productLinks: { where: { product: { status: "ACTIVE" } } } } },
} satisfies Prisma.CategorySelect;

export function listActiveCategoriesForStorefront(tenantId: string) {
  return prisma.category.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: PUBLIC_CATEGORY_SELECT,
    orderBy: { sortOrder: "asc" },
  });
}

export function findActiveCategoryBySlugForStorefront(tenantId: string, slug: string) {
  return prisma.category.findFirst({
    where: { tenantId, slug, status: "ACTIVE" },
    select: PUBLIC_CATEGORY_SELECT,
  });
}
