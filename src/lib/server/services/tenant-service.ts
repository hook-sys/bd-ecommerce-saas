import "server-only";
import { prisma } from "@/lib/server/db/client";
import { AppError } from "@/lib/errors/app-error";
import { slugify, isValidSlug } from "@/lib/server/tenant/hostname";
import { getReservedSlugs } from "@/lib/env";
import { slugExists, createTenantWithOwner } from "@/lib/server/repositories/tenant-repository";
import { logAuditEvent } from "@/lib/server/audit/audit-log-service";
import type { RegisterMerchantInput } from "@/lib/validators/tenant";

const MAX_SLUG_ATTEMPTS = 20;

// Collision-safe slug generation: "Rahim Fashion" -> "rahim-fashion", and if
// taken, "rahim-fashion-2", "rahim-fashion-3", etc. Also rejects reserved
// platform words (www, api, admin, ...) so a merchant can never claim one.
export async function generateUniqueSlug(storeName: string): Promise<string> {
  const base = slugify(storeName) || "store";
  const reserved = getReservedSlugs();

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if (reserved.has(candidate)) continue;
    if (!isValidSlug(candidate)) continue;
    if (!(await slugExists(candidate))) return candidate;
  }

  throw new AppError("SLUG_ALREADY_EXISTS", "Could not generate a unique store address. Try a different store name.");
}

// End-to-end automated onboarding: verified user -> tenant -> default plan
// -> trial subscription -> default settings/domain -> store live. No manual
// developer step is required for a normal signup.
export async function provisionTenantForNewMerchant(
  ownerId: string,
  input: Pick<RegisterMerchantInput, "storeName">
) {
  const slug = await generateUniqueSlug(input.storeName);

  const defaultPlan = await prisma.plan.findUnique({ where: { key: "trial" } });
  if (!defaultPlan) {
    throw new AppError("NOT_FOUND", "Default plan is not configured.");
  }

  const tenant = await createTenantWithOwner({
    name: input.storeName,
    slug,
    ownerId,
    planId: defaultPlan.id,
  });

  const trialDays = 14;
  const trialEndDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: defaultPlan.id,
      status: "TRIAL",
      monthlyFee: defaultPlan.defaultMonthlyFee,
      trialEndDate,
    },
  });

  await logAuditEvent({
    actorId: ownerId,
    actorRole: "TENANT_OWNER",
    tenantId: tenant.id,
    action: "tenant.create",
    resourceType: "tenant",
    resourceId: tenant.id,
    metadata: { slug: tenant.slug, plan: defaultPlan.key },
  });

  return tenant;
}
