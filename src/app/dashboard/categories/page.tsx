import Link from "next/link";
import { getOptionalUser } from "@/lib/server/auth/require-role";
import { resolveDashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";
import { listCategories } from "@/lib/server/services/category-service";
import { AppError } from "@/lib/errors/app-error";
import { CategoryStatusForm } from "@/app/dashboard/categories/category-status-form";
import { CategoryReorderButtons } from "@/app/dashboard/categories/category-reorder-buttons";

export const dynamic = "force-dynamic";

export default async function CategoriesListPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const authUser = await getOptionalUser();
  const context = authUser ? await resolveDashboardTenantContext(authUser.id) : null;
  if (!authUser || !context) {
    throw new AppError("TENANT_NOT_FOUND", "No store found for this account.");
  }

  const params = await searchParams;
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  const { items, total } = await listCategories(
    { tenantId: context.tenant.id, planId: context.tenant.planId },
    { page, pageSize: 50 }
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Categories</h1>
        <Link href="/dashboard/categories/new" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white">
          + Add Category
        </Link>
      </div>

      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-neutral-500">
            <th className="py-2">Name</th>
            <th className="py-2">Products</th>
            <th className="py-2">Status</th>
            <th className="py-2">Sort order</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((category) => (
            <tr key={category.id} className="border-b border-neutral-100">
              <td className="py-2">
                <Link href={`/dashboard/categories/${category.id}`} className="underline">
                  {category.name}
                </Link>
              </td>
              <td className="py-2">{category._count.productLinks}</td>
              <td className="py-2">{category.status}</td>
              <td className="py-2">
                <CategoryReorderButtons categoryId={category.id} allCategoryIds={items.map((c) => c.id)} />
              </td>
              <td className="py-2">
                <CategoryStatusForm categoryId={category.id} currentStatus={category.status} />
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-neutral-400">
                No categories yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-neutral-400">{total} total</p>
    </div>
  );
}
