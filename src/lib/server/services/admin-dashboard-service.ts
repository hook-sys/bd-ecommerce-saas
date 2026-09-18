import "server-only";
import { prisma } from "@/lib/server/db/client";

export interface DashboardStats {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  suspendedTenants: number;
  newRegistrations30d: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [totalTenants, activeTenants, trialTenants, suspendedTenants, newRegistrations30d] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { status: "ACTIVE" } }),
    prisma.tenant.count({ where: { status: "TRIAL" } }),
    prisma.tenant.count({ where: { status: "SUSPENDED" } }),
    prisma.tenant.count({ where: { createdAt: { gte: since30d } } }),
  ]);

  return { totalTenants, activeTenants, trialTenants, suspendedTenants, newRegistrations30d };
}
