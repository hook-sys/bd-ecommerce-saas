import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/server/db/client";
import { AppError } from "@/lib/errors/app-error";
import { logAuditEvent } from "@/lib/server/audit/audit-log-service";
import { getEffectiveFeatures } from "@/lib/server/features/feature-service";
import type { TenantRole, TenantStatus } from "@prisma/client";

// The merchant dashboard (unlike the storefront) is not resolved from the
// request hostname — a signed-in user may belong to several tenants and
// picks which one they're working in. That choice is remembered in this
// cookie, but the cookie is only ever a *hint*: every read below
// re-verifies the user's TenantUser membership against the database before
// trusting it. A tampered or stale cookie value can at worst fail to
// resolve a tenant (falls back to the user's first membership); it can
// never grant access to a tenant the user doesn't belong to.
export const ACTIVE_TENANT_COOKIE = "active_tenant_id";

export interface DashboardTenantSummary {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  planId: string | null;
}

export interface DashboardTenantContext {
  tenant: DashboardTenantSummary;
  role: TenantRole;
  effectiveFeatures: Record<string, boolean>;
}

export interface TenantMembership {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: TenantStatus;
  role: TenantRole;
}

export async function listTenantMemberships(userId: string): Promise<TenantMembership[]> {
  const memberships = await prisma.tenantUser.findMany({
    where: { userId },
    include: { tenant: { select: { id: true, name: true, slug: true, status: true } } },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => ({
    tenantId: m.tenant.id,
    tenantName: m.tenant.name,
    tenantSlug: m.tenant.slug,
    tenantStatus: m.tenant.status,
    role: m.role,
  }));
}

// Resolves "which tenant is this dashboard request working in" for an
// already-authenticated user. Returns null if the user has no tenant
// membership at all (e.g. a freshly-created Super Admin account with no
// store) — callers render an empty state for that, not an error.
export async function resolveDashboardTenantContext(userId: string): Promise<DashboardTenantContext | null> {
  const cookieStore = await cookies();
  const preferredTenantId = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value;

  let membership = preferredTenantId
    ? await prisma.tenantUser.findUnique({
        where: { tenantId_userId: { tenantId: preferredTenantId, userId } },
        include: { tenant: true },
      })
    : null;

  // The cookie pointed at a tenant this user no longer belongs to (or never
  // did) — fall back to their first membership rather than failing.
  if (!membership) {
    membership = await prisma.tenantUser.findFirst({
      where: { userId },
      include: { tenant: true },
      orderBy: { createdAt: "asc" },
    });
  }

  if (!membership) return null;

  const effectiveFeatures = await getEffectiveFeatures(membership.tenant.id, membership.tenant.planId);

  return {
    tenant: {
      id: membership.tenant.id,
      slug: membership.tenant.slug,
      name: membership.tenant.name,
      status: membership.tenant.status,
      planId: membership.tenant.planId,
    },
    role: membership.role,
    effectiveFeatures,
  };
}

// The only place a dashboard tenant switch is honored. The requested
// tenantId is treated as intent, never as authorization: membership is
// re-checked here regardless of what the client claims. A non-member's
// attempt is audit-logged as a denied privileged-access attempt, same as a
// direct Super Admin bypass attempt.
export async function switchTenant(userId: string, tenantId: string): Promise<DashboardTenantSummary> {
  const membership = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    include: { tenant: true },
  });

  if (!membership) {
    await logAuditEvent({
      actorId: userId,
      action: "access.denied.tenant_switch",
      resourceType: "tenant",
      resourceId: tenantId,
    });
    throw new AppError("FORBIDDEN", "You do not have access to this store.");
  }

  await logAuditEvent({
    actorId: userId,
    actorRole: membership.role,
    tenantId,
    action: "tenant.switch",
    resourceType: "tenant",
    resourceId: tenantId,
  });

  return {
    id: membership.tenant.id,
    slug: membership.tenant.slug,
    name: membership.tenant.name,
    status: membership.tenant.status,
    planId: membership.tenant.planId,
  };
}
