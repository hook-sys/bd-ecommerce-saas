import { notFound } from "next/navigation";
import { getOptionalUser } from "@/lib/server/auth/require-role";
import { resolveDashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";
import { getCategory } from "@/lib/server/services/category-service";
import { AppError } from "@/lib/errors/app-error";
import { CategoryForm } from "@/app/dashboard/categories/category-form";

export const dynamic = "force-dynamic";

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const authUser = await getOptionalUser();
  const context = authUser ? await resolveDashboardTenantContext(authUser.id) : null;
  if (!authUser || !context) {
    throw new AppError("TENANT_NOT_FOUND", "No store found for this account.");
  }

  const { id } = await params;
  const category = await getCategory({ tenantId: context.tenant.id, planId: context.tenant.planId }, id).catch(() => null);
  if (!category) notFound();

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Edit Category</h1>
      <CategoryForm
        initial={{
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description ?? "",
          image: category.image ?? "",
          status: category.status,
        }}
      />
    </div>
  );
}
