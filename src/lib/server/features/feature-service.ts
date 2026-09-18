import "server-only";
import { prisma } from "@/lib/server/db/client";
import { AppError } from "@/lib/errors/app-error";

// Single source of truth for "is feature X on for tenant Y". UI hiding, API
// enforcement, and direct-URL-access blocking all call this same function —
// there is exactly one place the enable/disable decision is made.
//
// Resolution order: TenantFeature override > PlanFeature default > false.
export async function getEffectiveFeatures(
  tenantId: string,
  planId: string | null
): Promise<Record<string, boolean>> {
  const [allFeatures, planFeatures, tenantFeatures] = await Promise.all([
    prisma.feature.findMany({ where: { isActive: true }, select: { key: true } }),
    planId
      ? prisma.planFeature.findMany({ where: { planId }, include: { feature: { select: { key: true } } } })
      : Promise.resolve([]),
    prisma.tenantFeature.findMany({ where: { tenantId }, include: { feature: { select: { key: true } } } }),
  ]);

  const result: Record<string, boolean> = {};
  for (const f of allFeatures) result[f.key] = false;
  for (const pf of planFeatures) result[pf.feature.key] = pf.enabled;
  for (const tf of tenantFeatures) result[tf.feature.key] = tf.enabled;

  return result;
}

export async function isFeatureEnabled(tenantId: string, planId: string | null, featureKey: string): Promise<boolean> {
  const features = await getEffectiveFeatures(tenantId, planId);
  return features[featureKey] === true;
}

// Guard for use at the top of route handlers / server actions that require
// a feature to be on. Throws a typed AppError the API layer converts to a
// 403 FEATURE_DISABLED — the same enforcement whether the request came from
// the UI, a direct API call, or a direct URL hit.
export async function requireFeature(tenantId: string, planId: string | null, featureKey: string): Promise<void> {
  const enabled = await isFeatureEnabled(tenantId, planId, featureKey);
  if (!enabled) {
    throw new AppError("FEATURE_DISABLED", `The "${featureKey}" feature is not enabled for this store.`);
  }
}
