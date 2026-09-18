import { describe, it, expect, vi, beforeEach } from "vitest";

const getHeader = vi.fn();
const findTenantBySlug = vi.fn();
const getEffectiveFeatures = vi.fn();

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (key: string) => getHeader(key) }),
}));

vi.mock("@/lib/server/repositories/tenant-repository", () => ({
  findTenantBySlug: (...args: unknown[]) => findTenantBySlug(...args),
}));

vi.mock("@/lib/server/features/feature-service", () => ({
  getEffectiveFeatures: (...args: unknown[]) => getEffectiveFeatures(...args),
}));

import { resolveTenantContext, requireActiveTenantContext } from "@/lib/server/tenant/tenant-context";

describe("resolveTenantContext", () => {
  beforeEach(() => {
    getHeader.mockReset();
    findTenantBySlug.mockReset();
    getEffectiveFeatures.mockReset();
    getEffectiveFeatures.mockResolvedValue({});
  });

  it("returns null when there is no trusted tenant-slug header (e.g. root domain request)", async () => {
    getHeader.mockReturnValue(null);
    const ctx = await resolveTenantContext();
    expect(ctx).toBeNull();
    expect(findTenantBySlug).not.toHaveBeenCalled();
  });

  it("resolves the tenant strictly by the slug carried in the trusted header, never a client field", async () => {
    getHeader.mockReturnValue("rahim");
    findTenantBySlug.mockResolvedValue({
      id: "tenant-rahim",
      slug: "rahim",
      name: "Rahim Fashion",
      status: "ACTIVE",
      planId: "basic",
    });

    const ctx = await resolveTenantContext();
    expect(findTenantBySlug).toHaveBeenCalledWith("rahim");
    expect(ctx?.id).toBe("tenant-rahim");
  });

  it("returns null when the header names a tenant slug that doesn't exist", async () => {
    getHeader.mockReturnValue("nonexistent");
    findTenantBySlug.mockResolvedValue(null);

    expect(await resolveTenantContext()).toBeNull();
  });
});

describe("requireActiveTenantContext", () => {
  beforeEach(() => {
    getHeader.mockReset();
    findTenantBySlug.mockReset();
    getEffectiveFeatures.mockReset();
    getEffectiveFeatures.mockResolvedValue({});
  });

  it("throws TENANT_NOT_FOUND when no tenant resolves", async () => {
    getHeader.mockReturnValue(null);
    await expect(requireActiveTenantContext()).rejects.toMatchObject({ code: "TENANT_NOT_FOUND" });
  });

  it("throws TENANT_SUSPENDED for a suspended tenant, blocking access without deleting data", async () => {
    getHeader.mockReturnValue("rahim");
    findTenantBySlug.mockResolvedValue({
      id: "tenant-rahim",
      slug: "rahim",
      name: "Rahim Fashion",
      status: "SUSPENDED",
      planId: "basic",
    });

    await expect(requireActiveTenantContext()).rejects.toMatchObject({ code: "TENANT_SUSPENDED" });
  });

  it("throws TENANT_SUSPENDED for a cancelled tenant too", async () => {
    getHeader.mockReturnValue("rahim");
    findTenantBySlug.mockResolvedValue({
      id: "tenant-rahim",
      slug: "rahim",
      name: "Rahim Fashion",
      status: "CANCELLED",
      planId: "basic",
    });

    await expect(requireActiveTenantContext()).rejects.toMatchObject({ code: "TENANT_SUSPENDED" });
  });

  it("returns the context for an active tenant", async () => {
    getHeader.mockReturnValue("rahim");
    findTenantBySlug.mockResolvedValue({
      id: "tenant-rahim",
      slug: "rahim",
      name: "Rahim Fashion",
      status: "ACTIVE",
      planId: "basic",
    });

    const ctx = await requireActiveTenantContext();
    expect(ctx.status).toBe("ACTIVE");
  });
});
