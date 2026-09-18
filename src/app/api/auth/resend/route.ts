import { NextResponse } from "next/server";
import { resendVerificationSchema } from "@/lib/validators/auth";
import { createSupabaseServerClient } from "@/lib/server/auth/supabase-server";
import { toApiErrorResponse } from "@/lib/errors/app-error";

// Same generic-response principle as forgot-password: never confirm or
// deny whether an email is registered.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = resendVerificationSchema.parse(body);

    const supabase = await createSupabaseServerClient();
    await supabase.auth.resend({ type: "signup", email: input.email });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
