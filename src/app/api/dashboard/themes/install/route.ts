import { NextResponse } from "next/server";
import { installThemeSchema } from "@/lib/validators/theme";
import { requireUser, requireTenantRole } from "@/lib/server/auth/require-role";
import { resolveDashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";
import { installTheme } from "@/lib/server/services/tenant-theme-service";
import { AppError, toApiErrorResponse } from "@/lib/errors/app-error";

// Installing never activates — see tenant-theme-service.installTheme.
// Restricted to owner/admin: changing what's installed on a store is a
// storefront-affecting action, not something any staff member should do.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const context = await resolveDashboardTenantContext(user.id);
    if (!context) throw new AppError("TENANT_NOT_FOUND", "No store found for this account.");
    await requireTenantRole(context.tenant.id, ["TENANT_OWNER", "TENANT_ADMIN"]);

    const body = await request.json();
    const input = installThemeSchema.parse(body);

    const tenantTheme = await installTheme(
      { tenantId: context.tenant.id, planId: context.tenant.planId },
      input,
      { id: user.id, role: context.role }
    );

    return NextResponse.json({ tenantThemeId: tenantTheme.id });
  } catch (error) {
    const { status, body } = toApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
