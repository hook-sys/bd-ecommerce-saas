import { prisma } from "@/lib/server/db/client";
import type { Prisma } from "@prisma/client";

// Every tenant-scoped read/write in the app goes through a repository like
// this one. Callers pass an already-resolved tenantId (from TenantContext or
// an authenticated session) — this layer never accepts a bare client input
// as the source of truth for which tenant to touch.

export function findTenantBySlug(slug: string) {
  return prisma.tenant.findUnique({
    where: { slug },
    include: { subscription: true, plan: true },
  });
}

export function findTenantByDomainHostname(hostname: string) {
  return prisma.domain.findUnique({
    where: { hostname },
    include: { tenant: { include: { subscription: true, plan: true } } },
  });
}

export function findTenantById(tenantId: string) {
  return prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { subscription: true, plan: true },
  });
}

export async function slugExists(slug: string): Promise<boolean> {
  const existing = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  return existing !== null;
}

export function createTenantWithOwner(input: {
  name: string;
  slug: string;
  ownerId: string;
  planId: string;
}) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.name,
        slug: input.slug,
        ownerId: input.ownerId,
        planId: input.planId,
        status: "TRIAL",
      },
    });

    await tx.tenantUser.create({
      data: { tenantId: tenant.id, userId: input.ownerId, role: "TENANT_OWNER" },
    });

    await tx.domain.create({
      data: {
        tenantId: tenant.id,
        type: "SUBDOMAIN",
        hostname: `${tenant.slug}.${process.env.PLATFORM_ROOT_DOMAIN ?? "localhost:3000"}`,
        isPrimary: true,
        verificationStatus: "VERIFIED",
      },
    });

    await tx.storeSettings.create({
      data: { tenantId: tenant.id, storeName: input.name },
    });

    await tx.themeSettings.create({
      data: { tenantId: tenant.id },
    });

    return tenant;
  });
}

export function findTenantMembership(tenantId: string, userId: string) {
  return prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
  });
}
