import type { AuthenticatedUser } from "@/lib/server/auth/require-role";
import type { DashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";

// The dashboard layout's routing/rendering decision, extracted as a pure
// function so it's unit-testable without rendering a Server Component. The
// layout itself just calls this and acts on the result — see
// src/app/dashboard/layout.tsx.
export type DashboardAccessDecision =
  | { type: "redirect"; to: string }
  | { type: "no_store" }
  | { type: "suspended"; tenant: DashboardTenantContext["tenant"] }
  | { type: "ok"; context: DashboardTenantContext };

export function resolveDashboardAccessDecision(params: {
  authUser: AuthenticatedUser | null;
  dashboardCtx: DashboardTenantContext | null;
}): DashboardAccessDecision {
  if (!params.authUser) {
    return { type: "redirect", to: "/login" };
  }

  if (!params.authUser.emailConfirmedAt) {
    return { type: "redirect", to: "/verify-email" };
  }

  if (!params.dashboardCtx) {
    return { type: "no_store" };
  }

  if (params.dashboardCtx.tenant.status === "SUSPENDED" || params.dashboardCtx.tenant.status === "CANCELLED") {
    return { type: "suspended", tenant: params.dashboardCtx.tenant };
  }

  return { type: "ok", context: params.dashboardCtx };
}
