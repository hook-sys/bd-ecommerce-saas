import { describe, it, expect, vi, beforeEach } from "vitest";

const findUniqueTenant = vi.fn();
const updateTenant = vi.fn();
const createAuditLog = vi.fn();

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    tenant: {
      findUnique: (...args: unknown[]) => findUniqueTenant(...args),
      update: (...args: unknown[]) => updateTenant(...args),
    },
  },
}));

vi.mock("@/lib/server/audit/audit-log-service", () => ({
  logAuditEvent: (...args: unknown[]) => createAuditLog(...args),
}));

import { setTenantStatus } from "@/lib/server/services/tenant-admin-service";

const ACTOR = { id: "admin-1", role: "SUPER_ADMIN" };

describe("setTenantStatus", () => {
  beforeEach(() => {
    findUniqueTenant.mockReset();
    updateTenant.mockReset();
    createAuditLog.mockReset();
  });

  it("allows TRIAL -> SUSPENDED and writes an audit log entry", async () => {
    findUniqueTenant.mockResolvedValue({ id: "t1", status: "TRIAL" });

    await setTenantStatus("t1", "SUSPENDED", ACTOR);

    expect(updateTenant).toHaveBeenCalledWith({ where: { id: "t1" }, data: { status: "SUSPENDED" } });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        tenantId: "t1",
        action: "tenant.status_change",
        metadata: { from: "TRIAL", to: "SUSPENDED" },
      })
    );
  });

  it("rejects an invalid transition (CANCELLED is terminal)", async () => {
    findUniqueTenant.mockResolvedValue({ id: "t1", status: "CANCELLED" });

    await expect(setTenantStatus("t1", "ACTIVE", ACTOR)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(updateTenant).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("never deletes tenant data — suspension only flips status", async () => {
    findUniqueTenant.mockResolvedValue({ id: "t1", status: "ACTIVE" });

    await setTenantStatus("t1", "SUSPENDED", ACTOR);

    const updateCall = updateTenant.mock.calls[0][0];
    expect(Object.keys(updateCall.data)).toEqual(["status"]);
  });

  it("throws TENANT_NOT_FOUND for an unknown tenant", async () => {
    findUniqueTenant.mockResolvedValue(null);

    await expect(setTenantStatus("missing", "ACTIVE", ACTOR)).rejects.toMatchObject({
      code: "TENANT_NOT_FOUND",
    });
  });
});
