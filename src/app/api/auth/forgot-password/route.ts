import { NextResponse } from "next/server";
import { forgotPasswordSchema } from "@/lib/validators/auth";
import { createSupabaseServerClient } from "@/lib/server/auth/supabase-server";
import { prisma } from "@/lib/server/db/client";
import { logAuditEvent } from "@/lib/server/audit/audit-log-service";
import { toApiErrorResponse } from "@/lib/errors/app-error";
import { getAppOrigin } from "@/lib/env";

// Always responds with the same generic success message regardless of
// whether the email exists — this endpoint must never let a caller enumerate
// registered accounts.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = forgotPasswordSchema.parse(body);

    const supabase = await createSupabaseServerClient();
    // Never derive this from request.url's Host-based origin — a spoofed
    // Host header would redirect a password-reset email to an
    // attacker-controlled domain. See getAppOrigin()'s doc comment.
    const origin = getAppOrigin();

    await supabase.auth.resetPasswordForEmail(input.email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    });

    const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
    if (existingUser) {
      await logAuditEvent({
        actorId: existingUser.id,
        action: "auth.password_reset_requested",
        resourceType: "user",
        resourceId: existingUser.id,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
