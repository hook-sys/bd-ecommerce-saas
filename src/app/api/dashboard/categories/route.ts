import { NextResponse } from "next/server";
import { createCategorySchema, catalogListQuerySchema } from "@/lib/validators/catalog";
import { requireUser, requireTenantRole } from "@/lib/server/auth/require-role";
import { resolveDashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";
import { listCategories, createCategory } from "@/lib/server/services/category-service";
import { AppError, toApiErrorResponse } from "@/lib/errors/app-error";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const context = await resolveDashboardTenantContext(user.id);
    if (!context) throw new AppError("TENANT_NOT_FOUND", "No store found for this account.");

    const url = new URL(request.url);
    const query = catalogListQuerySchema.parse(Object.fromEntries(url.searchParams));

    const result = await listCategories({ tenantId: context.tenant.id, planId: context.tenant.planId }, query);
    return NextResponse.json(result);
  } catch (error) {
    const { status, body } = toApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const context = await resolveDashboardTenantContext(user.id);
    if (!context) throw new AppError("TENANT_NOT_FOUND", "No store found for this account.");
    await requireTenantRole(context.tenant.id, ["TENANT_OWNER", "TENANT_ADMIN"]);

    const body = await request.json();
    const input = createCategorySchema.parse(body);

    const category = await createCategory({ tenantId: context.tenant.id, planId: context.tenant.planId }, input, {
      id: user.id,
      role: context.role,
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
