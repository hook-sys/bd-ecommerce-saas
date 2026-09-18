import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validators/auth";
import { createSupabaseServerClient } from "@/lib/server/auth/supabase-server";
import { prisma } from "@/lib/server/db/client";
import { logAuditEvent } from "@/lib/server/audit/audit-log-service";
import { toApiErrorResponse } from "@/lib/errors/app-error";

// Sign-in runs server-side (not via the browser client) so the session
// cookie is set on this response and we get one place to compute the
// role-appropriate redirect and write the login audit entry. The redirect
// target is coarse on purpose — it sends the user to the right *area*
// (super admin vs merchant dashboard); each area's own layout does the
// fine-grained status/verification checks (see resolveDashboardAccessDecision),
// so that logic isn't duplicated here.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = loginSchema.parse(body);

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (error) {
      if (error.code === "email_not_confirmed") {
        return NextResponse.json({ redirectTo: "/verify-email" });
      }
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } },
        { status: 401 }
      );
    }

    if (!data.user) {
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } },
        { status: 401 }
      );
    }

    const appUser = await prisma.user.upsert({
      where: { id: data.user.id },
      update: {},
      create: { id: data.user.id, email: data.user.email ?? input.email },
    });

    await logAuditEvent({
      actorId: appUser.id,
      actorRole: appUser.globalRole,
      action: "auth.login",
      resourceType: "user",
      resourceId: appUser.id,
    });

    const redirectTo = appUser.globalRole === "SUPER_ADMIN" ? "/super-admin" : "/dashboard";
    return NextResponse.json({ redirectTo });
  } catch (error) {
    const { status, body } = toApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
