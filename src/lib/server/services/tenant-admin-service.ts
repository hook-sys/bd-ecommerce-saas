import "server-only";
import { prisma } from "@/lib/server/db/client";
import { logAuditEvent } from "@/lib/server/audit/audit-log-service";
import { AppError } from "@/lib/errors/app-error";
import type { TenantStatus } from "@prisma/client";

const ALLOWED_TRANSITIONS: Record<TenantStatus, TenantStatus[]> = {
  TRIAL: ["ACTIVE", "SUSPENDED", "CANCELLED"],
  ACTIVE: ["PAST_DUE", "SUSPENDED", "CANCELLED"],
  PAST_DUE: ["ACTIVE", "GRACE_PERIOD", "SUSPENDED"],
  GRACE_PERIOD: ["ACTIVE", "SUSPENDED"],
  SUSPENDED: ["ACTIVE", "CANCELLED"],
  CANCELLED: [],
};

// Centralized state transition so every status change — whatever triggers
// it (Super Admin action, billing webhook, scheduled job) — goes through
// the same validity check and always produces an audit entry. Suspension
// never deletes or touches tenant-owned data; it only flips this flag,
// which downstream tenant-context checks use to gate access.
export async function setTenantStatus(
  tenantId: string,
  nextStatus: TenantStatus,
  actor: { id: string; role: string }
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new AppError("TENANT_NOT_FOUND", "Tenant not found.");

  const allowed = ALLOWED_TRANSITIONS[tenant.status];
  if (!allowed.includes(nextStatus)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Cannot transition tenant from ${tenant.status} to ${nextStatus}.`
    );
  }

  await prisma.tenant.update({ where: { id: tenantId }, data: { status: nextStatus } });

  await logAuditEvent({
    actorId: actor.id,
    actorRole: actor.role,
    tenantId,
    action: `tenant.status_change`,
    resourceType: "tenant",
    resourceId: tenantId,
    metadata: { from: tenant.status, to: nextStatus },
  });
}

export function listTenants(params: { search?: string; status?: TenantStatus; take?: number; skip?: number }) {
  return prisma.tenant.findMany({
    where: {
      status: params.status,
      OR: params.search
        ? [
            { name: { contains: params.search, mode: "insensitive" } },
            { slug: { contains: params.search, mode: "insensitive" } },
          ]
        : undefined,
    },
    include: { plan: true, subscription: true },
    orderBy: { createdAt: "desc" },
    take: params.take ?? 50,
    skip: params.skip ?? 0,
  });
}
