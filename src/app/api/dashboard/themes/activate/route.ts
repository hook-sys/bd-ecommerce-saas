import { NextResponse } from "next/server";
import { activateThemeSchema } from "@/lib/validators/theme";
import { requireUser, requireTenantRole } from "@/lib/server/auth/require-role";
import { resolveDashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";
import { activateTheme } from "@/lib/server/services/tenant-theme-service";
import { AppError, toApiErrorResponse } from "@/lib/errors/app-error";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const context = await resolveDashboardTenantContext(user.id);
    if (!context) throw new AppError("TENANT_NOT_FOUND", "No store found for this account.");
    await requireTenantRole(context.tenant.id, ["TENANT_OWNER", "TENANT_ADMIN"]);

    const body = await request.json();
    const input = activateThemeSchema.parse(body);

    await activateTheme(
      { tenantId: context.tenant.id, planId: context.tenant.planId },
      input.tenantThemeId,
      { id: user.id, role: context.role }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
