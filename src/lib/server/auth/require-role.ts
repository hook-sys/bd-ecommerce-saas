import "server-only";
import { AppError } from "@/lib/errors/app-error";
import { createSupabaseServerClient } from "@/lib/server/auth/supabase-server";
import { prisma } from "@/lib/server/db/client";
import { logAuditEvent } from "@/lib/server/audit/audit-log-service";
import type { GlobalRole, TenantRole } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  email: string;
  globalRole: GlobalRole;
  // From the Supabase session, not our own User row — this is what tells
  // us whether the merchant has clicked their verification link yet.
  emailConfirmedAt: string | null;
}

// Resolves the current Supabase session into our app-level User row, or
// null if there is no session at all. Prefer this over requireUser() in
// Server Components/layouts, where throwing would hit an error boundary
// instead of a clean redirect — callers decide what "no session" means for
// their route (e.g. redirect to /login).
export async function getOptionalUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const appUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!appUser) return null;

  return {
    id: appUser.id,
    email: appUser.email,
    globalRole: appUser.globalRole,
    emailConfirmedAt: user.email_confirmed_at ?? null,
  };
}

// Throws UNAUTHORIZED if there is no valid session at all. Use in API
// routes / Server Actions, where an AppError -> JSON error response is the
// right shape; use getOptionalUser() in Server Components instead.
export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getOptionalUser();
  if (!user) throw new AppError("UNAUTHORIZED", "You must be signed in.");
  return user;
}

export async function requireVerifiedUser(): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (!user.emailConfirmedAt) {
    throw new AppError("EMAIL_NOT_VERIFIED", "Please verify your email address first.");
  }
  return user;
}

// Guard for /super-admin routes and APIs. Global role, independent of any
// tenant membership. Every denial is audit-logged — this is the platform's
// single most sensitive boundary, and attempted access is exactly the kind
// of event DEVELOPMENT_RULES.md calls out as worth a permanent record.
export async function requireSuperAdmin(): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (user.globalRole !== "SUPER_ADMIN") {
    await logAuditEvent({
      actorId: user.id,
      actorRole: user.globalRole,
      action: "access.denied.super_admin",
      resourceType: "super_admin_area",
    });
    throw new AppError("FORBIDDEN", "Super admin access required.");
  }
  return user;
}

// Guard for tenant admin/staff routes. Verifies the authenticated user
// actually has a TenantUser row for the given tenant with a role in the
// allowed set — never trusts a role claimed anywhere else.
export async function requireTenantRole(
  tenantId: string,
  allowedRoles: TenantRole[]
): Promise<{ user: AuthenticatedUser; role: TenantRole }> {
  const user = await requireUser();

  const membership = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId, userId: user.id } },
  });

  if (!membership || !allowedRoles.includes(membership.role)) {
    throw new AppError("FORBIDDEN", "You do not have access to this store.");
  }

  return { user, role: membership.role };
}
