import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const findUniqueUser = vi.fn();
const findUniqueTenantUser = vi.fn();
const createAuditLog = vi.fn();

vi.mock("@/lib/server/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: () => getUser() },
  }),
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => findUniqueUser(...args) },
    tenantUser: { findUnique: (...args: unknown[]) => findUniqueTenantUser(...args) },
  },
}));

vi.mock("@/lib/server/audit/audit-log-service", () => ({
  logAuditEvent: (...args: unknown[]) => createAuditLog(...args),
}));

import { requireUser, requireSuperAdmin, requireTenantRole, getOptionalUser } from "@/lib/server/auth/require-role";

describe("requireUser", () => {
  beforeEach(() => {
    getUser.mockReset();
    findUniqueUser.mockReset();
  });

  it("throws UNAUTHORIZED when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws UNAUTHORIZED when the session user has no app-level row", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    findUniqueUser.mockResolvedValue(null);
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("requireSuperAdmin", () => {
  beforeEach(() => {
    getUser.mockReset();
    findUniqueUser.mockReset();
    createAuditLog.mockReset();
  });

  it("rejects a regular authenticated user (global role !== SUPER_ADMIN) and audit-logs the attempt", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    findUniqueUser.mockResolvedValue({ id: "u1", email: "merchant@example.com", globalRole: "USER" });

    await expect(requireSuperAdmin()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "u1", action: "access.denied.super_admin" })
    );
  });

  it("allows a SUPER_ADMIN user without logging a denial", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    findUniqueUser.mockResolvedValue({ id: "u1", email: "admin@example.com", globalRole: "SUPER_ADMIN" });

    const user = await requireSuperAdmin();
    expect(user.globalRole).toBe("SUPER_ADMIN");
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});

describe("getOptionalUser", () => {
  beforeEach(() => {
    getUser.mockReset();
    findUniqueUser.mockReset();
  });

  it("returns null instead of throwing when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await getOptionalUser()).toBeNull();
  });

  it("carries the Supabase email_confirmed_at through as emailConfirmedAt", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email_confirmed_at: "2026-01-01T00:00:00Z" } } });
    findUniqueUser.mockResolvedValue({ id: "u1", email: "x@example.com", globalRole: "USER" });

    const user = await getOptionalUser();
    expect(user?.emailConfirmedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("surfaces an unconfirmed email as null", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email_confirmed_at: undefined } } });
    findUniqueUser.mockResolvedValue({ id: "u1", email: "x@example.com", globalRole: "USER" });

    const user = await getOptionalUser();
    expect(user?.emailConfirmedAt).toBeNull();
  });
});

describe("requireTenantRole — cross-tenant access must be impossible", () => {
  beforeEach(() => {
    getUser.mockReset();
    findUniqueUser.mockReset();
    findUniqueTenantUser.mockReset();
  });

  it("rejects a user with no membership row for the target tenant at all", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    findUniqueUser.mockResolvedValue({ id: "u1", email: "x@example.com", globalRole: "USER" });
    findUniqueTenantUser.mockResolvedValue(null);

    await expect(requireTenantRole("tenant-karim", ["TENANT_OWNER", "TENANT_ADMIN"])).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects a user who owns a DIFFERENT tenant (simulated cross-tenant id manipulation)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "rahim-owner" } } });
    findUniqueUser.mockResolvedValue({ id: "rahim-owner", email: "rahim@example.com", globalRole: "USER" });
    // The membership lookup is itself scoped by the target tenantId — a
    // owner of "rahim" tenant has no row for "karim" tenant, so this
    // correctly resolves to null rather than reusing Rahim's role.
    findUniqueTenantUser.mockResolvedValue(null);

    await expect(requireTenantRole("tenant-karim", ["TENANT_OWNER"])).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(findUniqueTenantUser).toHaveBeenCalledWith({
      where: { tenantId_userId: { tenantId: "tenant-karim", userId: "rahim-owner" } },
    });
  });

  it("rejects staff trying to act with an owner-only permission", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    findUniqueUser.mockResolvedValue({ id: "u1", email: "staff@example.com", globalRole: "USER" });
    findUniqueTenantUser.mockResolvedValue({ role: "TENANT_STAFF" });

    await expect(requireTenantRole("tenant-1", ["TENANT_OWNER"])).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("allows a member whose role is in the allowed set", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    findUniqueUser.mockResolvedValue({ id: "u1", email: "owner@example.com", globalRole: "USER" });
    findUniqueTenantUser.mockResolvedValue({ role: "TENANT_OWNER" });

    const result = await requireTenantRole("tenant-1", ["TENANT_OWNER", "TENANT_ADMIN"]);
    expect(result.role).toBe("TENANT_OWNER");
  });
});
