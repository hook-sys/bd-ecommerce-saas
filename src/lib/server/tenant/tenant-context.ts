import "server-only";
import { headers } from "next/headers";
import { AppError } from "@/lib/errors/app-error";
import { findTenantBySlug } from "@/lib/server/repositories/tenant-repository";
import { getEffectiveFeatures } from "@/lib/server/features/feature-service";
import type { TenantStatus } from "@prisma/client";

// The single trusted representation of "which tenant is this request for."
// Built exclusively from server-verified sources: the resolved-tenant-slug
// header set by middleware (itself derived from the verified Host header),
// never from a query/body param. Downstream services take this object, not
// a raw string id, so there is no code path that can be handed an
// unverified tenant id.
export interface TenantContext {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  planId: string | null;
  effectiveFeatures: Record<string, boolean>;
}

const TENANT_SLUG_HEADER = "x-tenant-slug";

export async function resolveTenantContext(): Promise<TenantContext | null> {
  const headerList = await headers();
  const slug = headerList.get(TENANT_SLUG_HEADER);
  if (!slug) return null;

  const tenant = await findTenantBySlug(slug);
  if (!tenant) return null;

  const effectiveFeatures = await getEffectiveFeatures(tenant.id, tenant.planId);

  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
    planId: tenant.planId,
    effectiveFeatures,
  };
}

// Use in server actions/route handlers that require an active tenant with a
// usable store. Throws AppError with a code the API layer maps to the right
// HTTP status, instead of ad hoc 4xx responses scattered across routes.
export async function requireActiveTenantContext(): Promise<TenantContext> {
  const ctx = await resolveTenantContext();
  if (!ctx) throw new AppError("TENANT_NOT_FOUND", "No store found for this address.");
  if (ctx.status === "SUSPENDED" || ctx.status === "CANCELLED") {
    throw new AppError("TENANT_SUSPENDED", "This store is currently unavailable.");
  }
  return ctx;
}

export { TENANT_SLUG_HEADER };
