import { describe, it, expect, vi, beforeEach } from "vitest";

const requireFeature = vi.fn();
const createAuditLog = vi.fn();
const findCategoryById = vi.fn();
const createCategoryRow = vi.fn();
const updateCategoryRow = vi.fn();
const reorderCategoryRows = vi.fn();
const categorySlugExists = vi.fn();

vi.mock("@/lib/server/features/feature-service", () => ({
  requireFeature: (...args: unknown[]) => requireFeature(...args),
}));

vi.mock("@/lib/server/audit/audit-log-service", () => ({
  logAuditEvent: (...args: unknown[]) => createAuditLog(...args),
}));

vi.mock("@/lib/server/repositories/catalog-repository", () => ({
  findCategoryById: (...args: unknown[]) => findCategoryById(...args),
  createCategoryRow: (...args: unknown[]) => createCategoryRow(...args),
  updateCategoryRow: (...args: unknown[]) => updateCategoryRow(...args),
  reorderCategoryRows: (...args: unknown[]) => reorderCategoryRows(...args),
  categorySlugExists: (...args: unknown[]) => categorySlugExists(...args),
  listCategoriesForTenant: vi.fn(),
}));

import { createCategory, updateCategory, setCategoryStatus, getCategory, reorderCategories } from "@/lib/server/services/category-service";

const RAHIM = { tenantId: "rahim-tenant", planId: "basic" };
const KARIM = { tenantId: "karim-tenant", planId: "basic" };
const ACTOR = { id: "owner-1", role: "TENANT_OWNER" };

describe("product_catalog feature gating (categories)", () => {
  it("blocks category creation when product_catalog is disabled", async () => {
    requireFeature.mockRejectedValue(Object.assign(new Error("off"), { code: "FEATURE_DISABLED" }));
    await expect(createCategory(RAHIM, { name: "Shirts", status: "DRAFT", sortOrder: 0 }, ACTOR)).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
  });
});

describe("category slugs are tenant-scoped", () => {
  beforeEach(() => {
    requireFeature.mockReset().mockResolvedValue(undefined);
    categorySlugExists.mockReset();
    createCategoryRow.mockReset();
    createAuditLog.mockReset();
  });

  it("allows the same slug across two different tenants", async () => {
    categorySlugExists.mockImplementation(async (tenantId: string) => tenantId === RAHIM.tenantId);
    createCategoryRow.mockResolvedValue({ id: "c2" });

    await createCategory(KARIM, { name: "Shirts", slug: "shirts", status: "DRAFT", sortOrder: 0 }, ACTOR);
    expect(categorySlugExists).toHaveBeenCalledWith(KARIM.tenantId, "shirts");
  });

  it("rejects a duplicate slug within the same tenant", async () => {
    categorySlugExists.mockResolvedValue(true);
    await expect(
      createCategory(RAHIM, { name: "Shirts", slug: "shirts", status: "DRAFT", sortOrder: 0 }, ACTOR)
    ).rejects.toMatchObject({ code: "SLUG_ALREADY_EXISTS" });
    expect(createCategoryRow).not.toHaveBeenCalled();
  });
});

describe("category tenant isolation", () => {
  beforeEach(() => {
    requireFeature.mockReset().mockResolvedValue(undefined);
    findCategoryById.mockReset();
    updateCategoryRow.mockReset();
    reorderCategoryRows.mockReset();
    createAuditLog.mockReset();
  });

  it("rejects reading another tenant's category", async () => {
    findCategoryById.mockResolvedValue(null);
    await expect(getCategory(KARIM, "rahims-category-id")).rejects.toMatchObject({ code: "CATEGORY_NOT_FOUND" });
    expect(findCategoryById).toHaveBeenCalledWith(KARIM.tenantId, "rahims-category-id");
  });

  it("rejects updating another tenant's category", async () => {
    findCategoryById.mockResolvedValue(null);
    await expect(updateCategory(KARIM, "rahims-category-id", { name: "Hacked" }, ACTOR)).rejects.toMatchObject({
      code: "CATEGORY_NOT_FOUND",
    });
    expect(updateCategoryRow).not.toHaveBeenCalled();
  });

  it("rejects archiving another tenant's category", async () => {
    updateCategoryRow.mockResolvedValue(null);
    await expect(setCategoryStatus(KARIM, "rahims-category-id", "ARCHIVED", ACTOR)).rejects.toMatchObject({
      code: "CATEGORY_NOT_FOUND",
    });
  });

  it("reorder rejects when any id in the list doesn't belong to this tenant", async () => {
    reorderCategoryRows.mockResolvedValue(false); // repository found a mismatch and refused
    await expect(reorderCategories(RAHIM, ["c1", "karims-category"], ACTOR)).rejects.toMatchObject({
      code: "CATEGORY_NOT_FOUND",
    });
  });

  it("reorder succeeds and logs when every id belongs to this tenant", async () => {
    reorderCategoryRows.mockResolvedValue(true);
    await reorderCategories(RAHIM, ["c1", "c2"], ACTOR);
    expect(createAuditLog).toHaveBeenCalled();
  });
});
