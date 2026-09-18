import { describe, it, expect } from "vitest";
import { createProductSchema, updateProductSchema, createCategorySchema, updateCategorySchema } from "@/lib/validators/catalog";

const VALID_PRODUCT = { name: "Premium Shirt", price: 1200 };
const VALID_CATEGORY = { name: "Shirts" };

describe("catalog validators — client cannot assign tenantId/ownerId/createdByTenantId", () => {
  it("createProductSchema accepts a well-formed payload with no tenant fields", () => {
    const result = createProductSchema.parse(VALID_PRODUCT);
    expect(result.name).toBe("Premium Shirt");
  });

  it("createProductSchema rejects a payload that tries to smuggle in tenantId", () => {
    expect(() => createProductSchema.parse({ ...VALID_PRODUCT, tenantId: "some-other-tenant" })).toThrow();
  });

  it("createProductSchema rejects a payload that tries to smuggle in ownerId", () => {
    expect(() => createProductSchema.parse({ ...VALID_PRODUCT, ownerId: "someone-else" })).toThrow();
  });

  it("createProductSchema rejects a payload that tries to smuggle in createdByTenantId", () => {
    expect(() => createProductSchema.parse({ ...VALID_PRODUCT, createdByTenantId: "some-other-tenant" })).toThrow();
  });

  it("updateProductSchema rejects a tenantId override attempt too", () => {
    expect(() => updateProductSchema.parse({ name: "New name", tenantId: "some-other-tenant" })).toThrow();
  });

  it("createCategorySchema rejects a tenantId override attempt", () => {
    expect(() => createCategorySchema.parse({ ...VALID_CATEGORY, tenantId: "some-other-tenant" })).toThrow();
  });

  it("updateCategorySchema rejects a tenantId override attempt", () => {
    expect(() => updateCategorySchema.parse({ name: "New name", tenantId: "some-other-tenant" })).toThrow();
  });
});
