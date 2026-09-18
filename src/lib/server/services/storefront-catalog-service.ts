import "server-only";
import {
  listActiveProductsForStorefront,
  findActiveProductBySlugForStorefront,
  listActiveCategoriesForStorefront,
  findActiveCategoryBySlugForStorefront,
} from "@/lib/server/repositories/catalog-repository";

// Public shapes — deliberately hand-mapped (not "whatever Prisma returns")
// so a field can never leak here just because it got added to the model.
// tenantId, status, createdAt/updatedAt, and any future internal/admin
// field are never part of this output.
export interface PublicProductCard {
  id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
  featured: boolean;
}

export interface PublicProductDetail extends PublicProductCard {
  shortDescription: string | null;
  description: string | null;
  images: { url: string; altText: string | null }[];
  categories: { id: string; name: string; slug: string }[];
}

export interface PublicCategoryCard {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  productCount: number;
}

function toCard(product: {
  id: string;
  name: string;
  slug: string;
  price: unknown;
  compareAtPrice: unknown;
  featured: boolean;
  images: { url: string; altText: string | null; sortOrder: number }[];
}): PublicProductCard {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    price: Number(product.price),
    compareAtPrice: product.compareAtPrice != null ? Number(product.compareAtPrice) : null,
    imageUrl: product.images[0]?.url ?? null,
    featured: product.featured,
  };
}

export async function getStorefrontProducts(
  tenantId: string,
  params: { page?: number; pageSize?: number; featuredOnly?: boolean; categorySlug?: string } = {}
) {
  const page = params.page ?? 1;
  const pageSize = Math.min(params.pageSize ?? 12, 60);

  const { items, total } = await listActiveProductsForStorefront({
    tenantId,
    page,
    pageSize,
    featuredOnly: params.featuredOnly,
    categorySlug: params.categorySlug,
  });

  return { items: items.map(toCard), total, page, pageSize };
}

export async function getStorefrontProductBySlug(tenantId: string, slug: string): Promise<PublicProductDetail | null> {
  const product = await findActiveProductBySlugForStorefront(tenantId, slug);
  if (!product) return null;

  return {
    ...toCard(product),
    shortDescription: product.shortDescription,
    description: product.description,
    images: product.images.map((img) => ({ url: img.url, altText: img.altText })),
    categories: product.categoryLinks.map((link) => link.category),
  };
}

export async function getStorefrontCategories(tenantId: string): Promise<PublicCategoryCard[]> {
  const categories = await listActiveCategoriesForStorefront(tenantId);
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    imageUrl: c.image,
    productCount: c._count.productLinks,
  }));
}

export async function getStorefrontCategoryBySlug(tenantId: string, slug: string): Promise<PublicCategoryCard | null> {
  const category = await findActiveCategoryBySlugForStorefront(tenantId, slug);
  if (!category) return null;
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    imageUrl: category.image,
    productCount: category._count.productLinks,
  };
}
