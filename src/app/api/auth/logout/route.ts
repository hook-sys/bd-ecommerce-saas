import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/server/auth/supabase-server";
import { getOptionalUser } from "@/lib/server/auth/require-role";
import { ACTIVE_TENANT_COOKIE } from "@/lib/server/tenant/dashboard-tenant-context";
import { logAuditEvent } from "@/lib/server/audit/audit-log-service";
import { cookies } from "next/headers";

// Logs the event before signing out (once the session is gone, there is no
// user to attribute the log entry to), then invalidates the Supabase
// session server-side and clears the dashboard's tenant-selection cookie so
// a subsequent login doesn't inherit a stale "active tenant" pointer.
export async function POST() {
  const user = await getOptionalUser();

  if (user) {
    await logAuditEvent({
      actorId: user.id,
      actorRole: user.globalRole,
      action: "auth.logout",
      resourceType: "user",
      resourceId: user.id,
    });
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_TENANT_COOKIE);

  return NextResponse.json({ ok: true });
}
