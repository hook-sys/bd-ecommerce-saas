import { z } from "zod";

// Never accept tenantId, createdByTenantId, or ownerId from the client on
// any of these — tenant ownership is always derived server-side from
// TenantContext. `.strict()` makes an attempt to smuggle one of those in
// fail loudly instead of being silently dropped.

export const productImageInputSchema = z
  .object({
    url: z.string().url(),
    altText: z.string().max(200).optional(),
  })
  .strict();

export const createProductSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    // Optional: server generates a tenant-unique slug from `name` when
    // omitted (see generateUniqueProductSlug). When provided, it's still
    // validated and de-duplicated the same way.
    slug: z.string().trim().min(2).max(200).optional(),
    sku: z.string().trim().min(1).max(64).optional(),
    shortDescription: z.string().max(300).optional(),
    description: z.string().max(10000).optional(),
    price: z.coerce.number().positive().max(100_000_000),
    compareAtPrice: z.coerce.number().positive().max(100_000_000).optional(),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("DRAFT"),
    featured: z.boolean().default(false),
    categoryIds: z.array(z.string().uuid()).default([]),
    images: z.array(productImageInputSchema).max(20).default([]),
  })
  .strict();

export const updateProductSchema = createProductSchema.partial().strict();

export const setProductStatusSchema = z
  .object({
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
  })
  .strict();

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: z.string().trim().min(2).max(120).optional(),
    description: z.string().max(2000).optional(),
    image: z.string().url().optional(),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("DRAFT"),
    sortOrder: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const updateCategorySchema = createCategorySchema.partial().strict();

export const setCategoryStatusSchema = z
  .object({
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
  })
  .strict();

export const reorderCategoriesSchema = z
  .object({
    orderedCategoryIds: z.array(z.string().uuid()).min(1),
  })
  .strict();

export const catalogListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  q: z.string().trim().max(200).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CatalogListQuery = z.infer<typeof catalogListQuerySchema>;
