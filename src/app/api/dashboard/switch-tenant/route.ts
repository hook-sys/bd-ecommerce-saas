import { NextResponse } from "next/server";
import { switchTenantSchema } from "@/lib/validators/auth";
import { requireUser } from "@/lib/server/auth/require-role";
import { switchTenant, ACTIVE_TENANT_COOKIE } from "@/lib/server/tenant/dashboard-tenant-context";
import { toApiErrorResponse } from "@/lib/errors/app-error";

// The requested tenantId is only ever treated as intent — switchTenant()
// re-verifies the caller's membership before this route trusts it for
// anything (see the comment on switchTenantSchema).
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const input = switchTenantSchema.parse(body);

    const tenant = await switchTenant(user.id, input.tenantId);

    const response = NextResponse.json({ tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name } });
    response.cookies.set(ACTIVE_TENANT_COOKIE, tenant.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    const { status, body } = toApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
