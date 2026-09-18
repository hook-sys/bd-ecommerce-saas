import "server-only";
import { prisma } from "@/lib/server/db/client";

export interface AuditLogInput {
  actorId?: string | null;
  actorRole?: string | null;
  tenantId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

// Called from services, not directly from route handlers, so that
// privileged mutations can't ship without an audit trail by omission.
export async function logAuditEvent(input: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      tenantId: input.tenantId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      metadata: input.metadata ? (input.metadata as object) : undefined,
      ipAddress: input.ipAddress ?? null,
    },
  });
}
