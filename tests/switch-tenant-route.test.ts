import { describe, it, expect, vi, beforeEach } from "vitest";

const requireUser = vi.fn();
const switchTenant = vi.fn();

vi.mock("@/lib/server/auth/require-role", () => ({
  requireUser: (...args: unknown[]) => requireUser(...args),
}));

vi.mock("@/lib/server/tenant/dashboard-tenant-context", () => ({
  switchTenant: (...args: unknown[]) => switchTenant(...args),
  ACTIVE_TENANT_COOKIE: "active_tenant_id",
}));

import { POST } from "@/app/api/dashboard/switch-tenant/route";
import { AppError } from "@/lib/errors/app-error";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/dashboard/switch-tenant", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/dashboard/switch-tenant", () => {
  beforeEach(() => {
    requireUser.mockReset();
    switchTenant.mockReset();
  });

  it("rejects a tenantId that isn't a valid uuid (Zod boundary)", async () => {
    requireUser.mockResolvedValue({ id: "u1" });
    const res = await POST(makeRequest({ tenantId: "not-a-uuid" }));
    expect(res.status).toBe(400);
    expect(switchTenant).not.toHaveBeenCalled();
  });

  it("returns 403 when the user isn't actually a member of the requested tenant", async () => {
    requireUser.mockResolvedValue({ id: "karim-owner" });
    switchTenant.mockRejectedValue(new AppError("FORBIDDEN", "You do not have access to this store."));

    const res = await POST(makeRequest({ tenantId: "123e4567-e89b-12d3-a456-426614174000" }));
    expect(res.status).toBe(403);
  });

  it("sets the active_tenant_id cookie only on a verified, successful switch", async () => {
    requireUser.mockResolvedValue({ id: "owner-1" });
    switchTenant.mockResolvedValue({ id: "rahim-tenant", slug: "rahim", name: "Rahim Fashion" });

    const res = await POST(makeRequest({ tenantId: "123e4567-e89b-12d3-a456-426614174000" }));
    expect(res.status).toBe(200);
    expect(res.cookies.get("active_tenant_id")?.value).toBe("rahim-tenant");
  });
});
