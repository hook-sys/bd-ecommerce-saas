import { NextResponse } from "next/server";
import { createProductSchema, catalogListQuerySchema } from "@/lib/validators/catalog";
import { requireUser, requireTenantRole } from "@/lib/server/auth/require-role";
import { resolveDashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";
import { listProducts, createProduct } from "@/lib/server/services/product-service";
import { AppError, toApiErrorResponse } from "@/lib/errors/app-error";

async function resolveTenant() {
  const user = await requireUser();
  const context = await resolveDashboardTenantContext(user.id);
  if (!context) throw new AppError("TENANT_NOT_FOUND", "No store found for this account.");
  return { user, context };
}

export async function GET(request: Request) {
  try {
    const { context } = await resolveTenant();
    const url = new URL(request.url);
    const query = catalogListQuerySchema.parse(Object.fromEntries(url.searchParams));

    const result = await listProducts({ tenantId: context.tenant.id, planId: context.tenant.planId }, query);
    return NextResponse.json(result);
  } catch (error) {
    const { status, body } = toApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const { user, context } = await resolveTenant();
    await requireTenantRole(context.tenant.id, ["TENANT_OWNER", "TENANT_ADMIN"]);

    const body = await request.json();
    const input = createProductSchema.parse(body);

    const product = await createProduct({ tenantId: context.tenant.id, planId: context.tenant.planId }, input, {
      id: user.id,
      role: context.role,
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
