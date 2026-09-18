import { NextResponse } from "next/server";
import { registerMerchantSchema } from "@/lib/validators/tenant";
import { createSupabaseServerClient } from "@/lib/server/auth/supabase-server";
import { prisma } from "@/lib/server/db/client";
import { logAuditEvent } from "@/lib/server/audit/audit-log-service";
import { toApiErrorResponse, AppError } from "@/lib/errors/app-error";
import { getAppOrigin } from "@/lib/env";

// Registration only creates the (unconfirmed) Supabase auth user here.
// Tenant provisioning — the transactional "create tenant, TenantUser,
// plan, trial subscription, store/theme settings" step — happens in
// /auth/callback, *after* the merchant actually verifies their email. This
// matches the required flow: Register -> verify email -> provision tenant,
// and avoids ever creating a tenant for an account nobody has confirmed
// owning yet.
//
// The desired store name is carried in Supabase user_metadata
// (`pending_store_name`) until the callback reads it back — the client
// never gets to specify a tenantId, role, or plan; those stay entirely
// server-derived at provisioning time.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = registerMerchantSchema.parse(body);

    const supabase = await createSupabaseServerClient();
    // Never derive this from request.url's Host-based origin — see
    // getAppOrigin()'s doc comment for why that's spoofable.
    const origin = getAppOrigin();

    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/dashboard`,
        data: { pending_store_name: input.storeName },
      },
    });

    if (error || !data.user) {
      throw new AppError("VALIDATION_ERROR", error?.message ?? "Could not create account.");
    }

    await prisma.user.upsert({
      where: { id: data.user.id },
      update: {},
      create: { id: data.user.id, email: input.email },
    });

    await logAuditEvent({
      actorId: data.user.id,
      action: "auth.register",
      resourceType: "user",
      resourceId: data.user.id,
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
