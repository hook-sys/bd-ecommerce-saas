import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth/require-role";
import { resolveDashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";
import { getAppearanceData } from "@/lib/server/services/dashboard-service";
import { AppError, toApiErrorResponse } from "@/lib/errors/app-error";

// Direct API access is gated by the exact same getAppearanceData() call the
// /dashboard/appearance page uses — disabling theme_library for a tenant
// blocks both identically, not just the UI link.
export async function GET() {
  try {
    const user = await requireUser();
    const context = await resolveDashboardTenantContext(user.id);
    if (!context) {
      throw new AppError("TENANT_NOT_FOUND", "No store found for this account.");
    }

    const data = await getAppearanceData(context);
    return NextResponse.json(data);
  } catch (error) {
    const { status, body } = toApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
