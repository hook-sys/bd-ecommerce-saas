import { describe, it, expect, vi, beforeEach } from "vitest";

const requireFeature = vi.fn();
const createAuditLog = vi.fn();
const findProductById = vi.fn();
const createProductRow = vi.fn();
const updateProductRow = vi.fn();
const replaceProductCategories = vi.fn();
const replaceProductImages = vi.fn();
const productSlugExists = vi.fn();
const skuExists = vi.fn();
const categoryCount = vi.fn();

vi.mock("@/lib/server/features/feature-service", () => ({
  requireFeature: (...args: unknown[]) => requireFeature(...args),
}));

vi.mock("@/lib/server/audit/audit-log-service", () => ({
  logAuditEvent: (...args: unknown[]) => createAuditLog(...args),
}));

vi.mock("@/lib/server/repositories/catalog-repository", () => ({
  findProductById: (...args: unknown[]) => findProductById(...args),
  createProductRow: (...args: unknown[]) => createProductRow(...args),
  updateProductRow: (...args: unknown[]) => updateProductRow(...args),
  replaceProductCategories: (...args: unknown[]) => replaceProductCategories(...args),
  replaceProductImages: (...args: unknown[]) => replaceProductImages(...args),
  productSlugExists: (...args: unknown[]) => productSlugExists(...args),
  skuExists: (...args: unknown[]) => skuExists(...args),
  listProductsForTenant: vi.fn(),
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: { category: { count: (...args: unknown[]) => categoryCount(...args) } },
}));

import { createProduct, updateProduct, setProductStatus, getProduct } from "@/lib/server/services/product-service";

const RAHIM = { tenantId: "rahim-tenant", planId: "basic" };
const KARIM = { tenantId: "karim-tenant", planId: "basic" };
const ACTOR = { id: "owner-1", role: "TENANT_OWNER" };

const BASE_INPUT = {
  name: "Premium Shirt",
  price: 1200,
  status: "DRAFT" as const,
  featured: false,
  categoryIds: [],
  images: [],
};

describe("product_catalog feature gating", () => {
  beforeEach(() => {
    requireFeature.mockReset();
  });

  it("blocks product creation when product_catalog is disabled for the tenant", async () => {
    requireFeature.mockRejectedValue(Object.assign(new Error("off"), { code: "FEATURE_DISABLED" }));
    await expect(createProduct(RAHIM, BASE_INPUT, ACTOR)).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
  });
});

describe("createProduct — slugs and SKUs are tenant-scoped", () => {
  beforeEach(() => {
    requireFeature.mockReset().mockResolvedValue(undefined);
    productSlugExists.mockReset();
    skuExists.mockReset();
    createProductRow.mockReset();
    findProductById.mockReset();
    categoryCount.mockReset();
    createAuditLog.mockReset();
  });

  it("auto-generates a unique slug from the name when none is provided", async () => {
    productSlugExists.mockResolvedValue(false);
    createProductRow.mockResolvedValue({ id: "p1", tenantId: RAHIM.tenantId });
    findProductById.mockResolvedValue({ id: "p1", images: [], categoryLinks: [] });

    await createProduct(RAHIM, BASE_INPUT, ACTOR);

    const call = createProductRow.mock.calls[0][0];
    expect(call.slug).toBe("premium-shirt");
  });

  it("allows the SAME slug across two different tenants (duplicate product slug allowed across tenants)", async () => {
    // Rahim already has "premium-shirt"; Karim creating one too must not
    // be blocked — productSlugExists is scoped by tenantId, so Karim's
    // check independently resolves to false.
    productSlugExists.mockImplementation(async (tenantId: string) => tenantId === RAHIM.tenantId);
    createProductRow.mockResolvedValue({ id: "p2", tenantId: KARIM.tenantId });
    findProductById.mockResolvedValue({ id: "p2", images: [], categoryLinks: [] });

    await createProduct(KARIM, { ...BASE_INPUT, slug: "premium-shirt" }, ACTOR);

    expect(productSlugExists).toHaveBeenCalledWith(KARIM.tenantId, "premium-shirt");
  });

  it("rejects a duplicate slug within the SAME tenant", async () => {
    productSlugExists.mockResolvedValue(true);
    await expect(createProduct(RAHIM, { ...BASE_INPUT, slug: "premium-shirt" }, ACTOR)).rejects.toMatchObject({
      code: "SLUG_ALREADY_EXISTS",
    });
    expect(createProductRow).not.toHaveBeenCalled();
  });

  it("allows the SAME SKU across two different tenants", async () => {
    productSlugExists.mockResolvedValue(false);
    skuExists.mockImplementation(async (tenantId: string) => tenantId === RAHIM.tenantId);
    createProductRow.mockResolvedValue({ id: "p2", tenantId: KARIM.tenantId });
    findProductById.mockResolvedValue({ id: "p2", images: [], categoryLinks: [] });

    await createProduct(KARIM, { ...BASE_INPUT, sku: "SHIRT-001" }, ACTOR);
    expect(skuExists).toHaveBeenCalledWith(KARIM.tenantId, "SHIRT-001");
  });

  it("rejects a duplicate SKU within the SAME tenant", async () => {
    productSlugExists.mockResolvedValue(false);
    skuExists.mockResolvedValue(true);
    await expect(createProduct(RAHIM, { ...BASE_INPUT, sku: "SHIRT-001" }, ACTOR)).rejects.toMatchObject({
      code: "SKU_ALREADY_EXISTS",
    });
    expect(createProductRow).not.toHaveBeenCalled();
  });

  it("verifies every categoryId belongs to this tenant before linking (cannot cross tenants)", async () => {
    productSlugExists.mockResolvedValue(false);
    categoryCount.mockResolvedValue(1); // only 1 of 2 requested ids actually belongs to this tenant

    await expect(
      createProduct(RAHIM, { ...BASE_INPUT, categoryIds: ["cat-mine", "cat-karims"] }, ACTOR)
    ).rejects.toMatchObject({ code: "CATEGORY_NOT_FOUND" });
    expect(createProductRow).not.toHaveBeenCalled();
  });

  it("logs product.created on success", async () => {
    productSlugExists.mockResolvedValue(false);
    createProductRow.mockResolvedValue({ id: "p1", tenantId: RAHIM.tenantId });
    findProductById.mockResolvedValue({ id: "p1", images: [], categoryLinks: [] });

    await createProduct(RAHIM, BASE_INPUT, ACTOR);
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "product.created" }));
  });
});

describe("updateProduct / setProductStatus — tenant isolation", () => {
  beforeEach(() => {
    requireFeature.mockReset().mockResolvedValue(undefined);
    findProductById.mockReset();
    updateProductRow.mockReset();
    createAuditLog.mockReset();
  });

  it("rejects updating a product that belongs to a different tenant (not found under this tenant's scope)", async () => {
    // Karim tries to update Rahim's product id — findProductById is scoped
    // by (tenantId, id), so under Karim's tenant it resolves to null.
    findProductById.mockResolvedValue(null);

    await expect(updateProduct(KARIM, "rahims-product-id", { name: "Hacked" }, ACTOR)).rejects.toMatchObject({
      code: "PRODUCT_NOT_FOUND",
    });
    expect(findProductById).toHaveBeenCalledWith(KARIM.tenantId, "rahims-product-id");
    expect(updateProductRow).not.toHaveBeenCalled();
  });

  it("rejects archiving a product that belongs to a different tenant", async () => {
    updateProductRow.mockResolvedValue(null); // updateMany where tenantId+id matched 0 rows

    await expect(setProductStatus(KARIM, "rahims-product-id", "ARCHIVED", ACTOR)).rejects.toMatchObject({
      code: "PRODUCT_NOT_FOUND",
    });
  });

  it("rejects reading a product that belongs to a different tenant", async () => {
    findProductById.mockResolvedValue(null);
    await expect(getProduct(KARIM, "rahims-product-id")).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("allows updating a product that genuinely belongs to this tenant", async () => {
    findProductById.mockResolvedValue({ id: "p1", slug: "premium-shirt", sku: null, images: [], categoryLinks: [] });
    updateProductRow.mockResolvedValue({ id: "p1" });

    await updateProduct(RAHIM, "p1", { name: "Premium Shirt v2" }, ACTOR);
    expect(updateProductRow).toHaveBeenCalledWith(RAHIM.tenantId, "p1", expect.objectContaining({ name: "Premium Shirt v2" }));
  });

  it("logs product.activated / product.archived with the right action name", async () => {
    updateProductRow.mockResolvedValue({ id: "p1", status: "ACTIVE" });
    await setProductStatus(RAHIM, "p1", "ACTIVE", ACTOR);
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "product.activated" }));

    createAuditLog.mockReset();
    updateProductRow.mockResolvedValue({ id: "p1", status: "ARCHIVED" });
    await setProductStatus(RAHIM, "p1", "ARCHIVED", ACTOR);
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "product.archived" }));
  });
});
