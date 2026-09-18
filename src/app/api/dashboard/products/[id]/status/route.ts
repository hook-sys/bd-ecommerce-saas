import { NextResponse } from "next/server";
import { setProductStatusSchema } from "@/lib/validators/catalog";
import { requireUser, requireTenantRole } from "@/lib/server/auth/require-role";
import { resolveDashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";
import { setProductStatus } from "@/lib/server/services/product-service";
import { AppError, toApiErrorResponse } from "@/lib/errors/app-error";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const context = await resolveDashboardTenantContext(user.id);
    if (!context) throw new AppError("TENANT_NOT_FOUND", "No store found for this account.");
    await requireTenantRole(context.tenant.id, ["TENANT_OWNER", "TENANT_ADMIN"]);

    const { id } = await params;
    const body = await request.json();
    const input = setProductStatusSchema.parse(body);

    const product = await setProductStatus({ tenantId: context.tenant.id, planId: context.tenant.planId }, id, input.status, {
      id: user.id,
      role: context.role,
    });

    return NextResponse.json({ product });
  } catch (error) {
    const { status, body } = toApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
