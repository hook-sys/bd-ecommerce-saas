import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyProduct = vi.fn();
const countProduct = vi.fn();
const findFirstProduct = vi.fn();
const findManyCategory = vi.fn();
const findFirstCategory = vi.fn();

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    product: {
      findMany: (...args: unknown[]) => findManyProduct(...args),
      count: (...args: unknown[]) => countProduct(...args),
      findFirst: (...args: unknown[]) => findFirstProduct(...args),
    },
    category: {
      findMany: (...args: unknown[]) => findManyCategory(...args),
      findFirst: (...args: unknown[]) => findFirstCategory(...args),
    },
  },
}));

import {
  listActiveProductsForStorefront,
  findActiveProductBySlugForStorefront,
  listActiveCategoriesForStorefront,
  findActiveCategoryBySlugForStorefront,
} from "@/lib/server/repositories/catalog-repository";

describe("storefront product queries — status ACTIVE is always hard-filtered", () => {
  beforeEach(() => {
    findManyProduct.mockReset().mockResolvedValue([]);
    countProduct.mockReset().mockResolvedValue(0);
    findFirstProduct.mockReset();
  });

  it("listActiveProductsForStorefront always filters status: ACTIVE, never lets a caller widen it", async () => {
    await listActiveProductsForStorefront({ tenantId: "rahim-tenant", page: 1, pageSize: 12 });
    const where = findManyProduct.mock.calls[0][0].where;
    expect(where.status).toBe("ACTIVE");
    expect(where.tenantId).toBe("rahim-tenant");
  });

  it("findActiveProductBySlugForStorefront filters status: ACTIVE — a DRAFT or ARCHIVED product's slug cannot resolve here", async () => {
    findFirstProduct.mockResolvedValue(null);
    await findActiveProductBySlugForStorefront("rahim-tenant", "premium-shirt");
    const where = findFirstProduct.mock.calls[0][0].where;
    expect(where).toEqual({ tenantId: "rahim-tenant", slug: "premium-shirt", status: "ACTIVE" });
  });

  it("the public product select never includes tenantId, status, createdAt, or updatedAt", async () => {
    await listActiveProductsForStorefront({ tenantId: "rahim-tenant", page: 1, pageSize: 12 });
    const select = findManyProduct.mock.calls[0][0].select;
    expect(select.tenantId).toBeUndefined();
    expect(select.status).toBeUndefined();
    expect(select.createdAt).toBeUndefined();
    expect(select.updatedAt).toBeUndefined();
  });

  it("category-scoped listing only matches active categories belonging to the SAME tenant (no cross-tenant category filter)", async () => {
    await listActiveProductsForStorefront({ tenantId: "rahim-tenant", page: 1, pageSize: 12, categorySlug: "shirts" });
    const where = findManyProduct.mock.calls[0][0].where;
    expect(where.categoryLinks.some.category).toEqual({ tenantId: "rahim-tenant", slug: "shirts", status: "ACTIVE" });
  });
});

describe("storefront category queries — status ACTIVE is always hard-filtered", () => {
  beforeEach(() => {
    findManyCategory.mockReset().mockResolvedValue([]);
    findFirstCategory.mockReset();
  });

  it("listActiveCategoriesForStorefront always filters status: ACTIVE and this tenant only", async () => {
    await listActiveCategoriesForStorefront("rahim-tenant");
    const where = findManyCategory.mock.calls[0][0].where;
    expect(where).toEqual({ tenantId: "rahim-tenant", status: "ACTIVE" });
  });

  it("findActiveCategoryBySlugForStorefront filters status: ACTIVE", async () => {
    findFirstCategory.mockResolvedValue(null);
    await findActiveCategoryBySlugForStorefront("rahim-tenant", "shirts");
    const where = findFirstCategory.mock.calls[0][0].where;
    expect(where).toEqual({ tenantId: "rahim-tenant", slug: "shirts", status: "ACTIVE" });
  });

  it("the public category select never includes tenantId or status", async () => {
    await listActiveCategoriesForStorefront("rahim-tenant");
    const select = findManyCategory.mock.calls[0][0].select;
    expect(select.tenantId).toBeUndefined();
    expect(select.status).toBeUndefined();
  });
});
