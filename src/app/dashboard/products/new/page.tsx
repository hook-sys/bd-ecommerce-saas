import { getOptionalUser } from "@/lib/server/auth/require-role";
import { resolveDashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";
import { listCategories } from "@/lib/server/services/category-service";
import { AppError } from "@/lib/errors/app-error";
import { ProductForm } from "@/app/dashboard/products/product-form";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const authUser = await getOptionalUser();
  const context = authUser ? await resolveDashboardTenantContext(authUser.id) : null;
  if (!authUser || !context) {
    throw new AppError("TENANT_NOT_FOUND", "No store found for this account.");
  }

  const { items: categories } = await listCategories(
    { tenantId: context.tenant.id, planId: context.tenant.planId },
    { page: 1, pageSize: 100 }
  );

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Add Product</h1>
      <ProductForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
