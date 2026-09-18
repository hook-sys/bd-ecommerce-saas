import { describe, it, expect } from "vitest";
import { resolveDashboardAccessDecision } from "@/lib/server/tenant/dashboard-access";
import type { AuthenticatedUser } from "@/lib/server/auth/require-role";
import type { DashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";

const VERIFIED_USER: AuthenticatedUser = {
  id: "u1",
  email: "owner@example.com",
  globalRole: "USER",
  emailConfirmedAt: "2026-01-01T00:00:00Z",
};

const UNVERIFIED_USER: AuthenticatedUser = { ...VERIFIED_USER, emailConfirmedAt: null };

function makeContext(status: "ACTIVE" | "SUSPENDED" | "CANCELLED" | "TRIAL"): DashboardTenantContext {
  return {
    tenant: { id: "t1", slug: "rahim", name: "Rahim Fashion", status, planId: "basic" },
    role: "TENANT_OWNER",
    effectiveFeatures: {},
  };
}

describe("resolveDashboardAccessDecision", () => {
  it("redirects to /login when there is no authenticated user", () => {
    const decision = resolveDashboardAccessDecision({ authUser: null, dashboardCtx: null });
    expect(decision).toEqual({ type: "redirect", to: "/login" });
  });

  it("redirects to /verify-email when the user hasn't confirmed their email", () => {
    const decision = resolveDashboardAccessDecision({ authUser: UNVERIFIED_USER, dashboardCtx: makeContext("ACTIVE") });
    expect(decision).toEqual({ type: "redirect", to: "/verify-email" });
  });

  it("shows the no_store state when a verified user has no tenant membership", () => {
    const decision = resolveDashboardAccessDecision({ authUser: VERIFIED_USER, dashboardCtx: null });
    expect(decision).toEqual({ type: "no_store" });
  });

  it("shows the suspended state and blocks the dashboard for a SUSPENDED tenant", () => {
    const decision = resolveDashboardAccessDecision({ authUser: VERIFIED_USER, dashboardCtx: makeContext("SUSPENDED") });
    expect(decision.type).toBe("suspended");
  });

  it("shows the suspended state for a CANCELLED tenant too", () => {
    const decision = resolveDashboardAccessDecision({ authUser: VERIFIED_USER, dashboardCtx: makeContext("CANCELLED") });
    expect(decision.type).toBe("suspended");
  });

  it("allows the dashboard for a verified user with an ACTIVE tenant", () => {
    const decision = resolveDashboardAccessDecision({ authUser: VERIFIED_USER, dashboardCtx: makeContext("ACTIVE") });
    expect(decision.type).toBe("ok");
  });

  it("allows the dashboard for a TRIAL tenant (trial is not a blocked state)", () => {
    const decision = resolveDashboardAccessDecision({ authUser: VERIFIED_USER, dashboardCtx: makeContext("TRIAL") });
    expect(decision.type).toBe("ok");
  });
});
