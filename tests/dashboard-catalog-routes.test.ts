import { describe, it, expect, vi, beforeEach } from "vitest";

const requireUser = vi.fn();
const resolveDashboardTenantContext = vi.fn();
const listProducts = vi.fn();
const listCategories = vi.fn();

vi.mock("@/lib/server/auth/require-role", () => ({
  requireUser: (...args: unknown[]) => requireUser(...args),
  requireTenantRole: vi.fn(),
}));

vi.mock("@/lib/server/tenant/dashboard-tenant-context", () => ({
  resolveDashboardTenantContext: (...args: unknown[]) => resolveDashboardTenantContext(...args),
}));

vi.mock("@/lib/server/services/product-service", () => ({
  listProducts: (...args: unknown[]) => listProducts(...args),
}));

vi.mock("@/lib/server/services/category-service", () => ({
  listCategories: (...args: unknown[]) => listCategories(...args),
}));

import { GET as getProducts } from "@/app/api/dashboard/products/route";
import { GET as getCategories } from "@/app/api/dashboard/categories/route";
import { AppError } from "@/lib/errors/app-error";

const CONTEXT = {
  tenant: { id: "t1", slug: "rahim", name: "Rahim Fashion", status: "ACTIVE", planId: "basic" },
  role: "TENANT_OWNER",
  effectiveFeatures: {},
};

function makeRequest(path: string) {
  return new Request(`http://localhost:3000${path}`);
}

describe("GET /api/dashboard/products — blocked when product_catalog is disabled", () => {
  beforeEach(() => {
    requireUser.mockReset().mockResolvedValue({ id: "u1" });
    resolveDashboardTenantContext.mockReset().mockResolvedValue(CONTEXT);
    listProducts.mockReset();
  });

  it("returns 403 FEATURE_DISABLED for direct API access when the feature is off", async () => {
    listProducts.mockRejectedValue(new AppError("FEATURE_DISABLED", "Product catalog is not enabled."));
    const res = await getProducts(makeRequest("/api/dashboard/products"));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error.code).toBe("FEATURE_DISABLED");
  });

  it("returns 200 with the product list when enabled", async () => {
    listProducts.mockResolvedValue({ items: [], total: 0 });
    const res = await getProducts(makeRequest("/api/dashboard/products"));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/dashboard/categories — blocked when product_catalog is disabled", () => {
  beforeEach(() => {
    requireUser.mockReset().mockResolvedValue({ id: "u1" });
    resolveDashboardTenantContext.mockReset().mockResolvedValue(CONTEXT);
    listCategories.mockReset();
  });

  it("returns 403 FEATURE_DISABLED for direct API access when the feature is off", async () => {
    listCategories.mockRejectedValue(new AppError("FEATURE_DISABLED", "Product catalog is not enabled."));
    const res = await getCategories(makeRequest("/api/dashboard/categories"));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error.code).toBe("FEATURE_DISABLED");
  });

  it("returns 200 with the category list when enabled", async () => {
    listCategories.mockResolvedValue({ items: [], total: 0 });
    const res = await getCategories(makeRequest("/api/dashboard/categories"));
    expect(res.status).toBe(200);
  });
});
