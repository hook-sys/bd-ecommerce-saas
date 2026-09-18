import { NextResponse } from "next/server";
import { updateCategorySchema } from "@/lib/validators/catalog";
import { requireUser, requireTenantRole } from "@/lib/server/auth/require-role";
import { resolveDashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";
import { getCategory, updateCategory } from "@/lib/server/services/category-service";
import { AppError, toApiErrorResponse } from "@/lib/errors/app-error";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const context = await resolveDashboardTenantContext(user.id);
    if (!context) throw new AppError("TENANT_NOT_FOUND", "No store found for this account.");

    const { id } = await params;
    const category = await getCategory({ tenantId: context.tenant.id, planId: context.tenant.planId }, id);
    return NextResponse.json({ category });
  } catch (error) {
    const { status, body } = toApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const context = await resolveDashboardTenantContext(user.id);
    if (!context) throw new AppError("TENANT_NOT_FOUND", "No store found for this account.");
    await requireTenantRole(context.tenant.id, ["TENANT_OWNER", "TENANT_ADMIN"]);

    const { id } = await params;
    const body = await request.json();
    const input = updateCategorySchema.parse(body);

    const category = await updateCategory({ tenantId: context.tenant.id, planId: context.tenant.planId }, id, input, {
      id: user.id,
      role: context.role,
    });

    return NextResponse.json({ category });
  } catch (error) {
    const { status, body } = toApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
