import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/server/auth/supabase-server";
import { prisma } from "@/lib/server/db/client";
import { provisionTenantForNewMerchant } from "@/lib/server/services/tenant-service";
import { logAuditEvent } from "@/lib/server/audit/audit-log-service";

// Single landing point for every Supabase email link: signup confirmation,
// password recovery, and (later) invite links all redirect here with a
// `code` param that gets exchanged for a session. `next` says where to
// send the user afterwards — validated below so it can never become an
// open redirect: only a same-origin relative path is accepted. This
// rejects an absolute URL ("https://evil.example.com"), a protocol-relative
// one ("//evil.example.com"), a backslash variant some browsers normalize
// to "//" ("/\evil.example.com"), and non-http(s) schemes ("javascript:...")
// — none of those start with a single "/", and any that slip past that
// check are caught by the origin comparison below.
function safeNextPath(next: string | null): string {
  if (!next) return "/dashboard";
  if (!/^\/(?!\/|\\)/.test(next)) return "/dashboard";

  try {
    const resolved = new URL(next, "http://internal.invalid");
    if (resolved.origin !== "http://internal.invalid") return "/dashboard";
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return "/dashboard";
  }
}

// Every failure mode here — a missing code, an invalid/expired/already-used
// code, or an unexpected downstream failure (e.g. the database being
// unreachable) — must send the user to a safe page, never surface a raw
// 500. Nothing sensitive (the auth code, tokens, session contents) is ever
// logged; only a generic, non-sensitive message is written server-side so
// operators can diagnose from Vercel logs without exposing internals to
// the client.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", url.origin));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.user) {
      return NextResponse.redirect(new URL("/login?error=link_expired", url.origin));
    }

    const user = data.user;

    await prisma.user.upsert({
      where: { id: user.id },
      update: { email: user.email ?? undefined },
      create: { id: user.id, email: user.email ?? "" },
    });

    // A password-recovery link also exchanges a code and lands here — it's
    // distinguished by its `next` target (set when the reset email was
    // requested) and must not trigger email-verification bookkeeping or
    // tenant provisioning.
    const isPasswordRecovery = next === "/reset-password";

    if (!isPasswordRecovery) {
      // First time this verified user lands here with no tenant of their own
      // yet: this is the "verify email -> provision tenant" step of the
      // registration flow, not something the client triggers directly.
      const existingMembership = await prisma.tenantUser.findFirst({ where: { userId: user.id } });
      const pendingStoreName = (user.user_metadata as Record<string, unknown> | null)?.pending_store_name;

      if (!existingMembership && typeof pendingStoreName === "string" && pendingStoreName.length > 0) {
        await provisionTenantForNewMerchant(user.id, { storeName: pendingStoreName });
      }

      await logAuditEvent({
        actorId: user.id,
        action: "auth.email_verified",
        resourceType: "user",
        resourceId: user.id,
      });
    }

    return NextResponse.redirect(new URL(next, url.origin));
  } catch (error) {
    // Session exchange succeeded but a downstream step failed (e.g. the
    // database rejected the connection) — the user already has a valid
    // Supabase session at this point, so send them somewhere safe rather
    // than a dead end; never expose the underlying error to the client.
    console.error("auth/callback failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.redirect(new URL("/login?error=server_error", url.origin));
  }
}
