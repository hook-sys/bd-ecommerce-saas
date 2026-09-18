import Link from "next/link";
import { getOptionalUser } from "@/lib/server/auth/require-role";
import { resolveDashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";
import { listProducts } from "@/lib/server/services/product-service";
import { AppError } from "@/lib/errors/app-error";
import { ProductStatusForm } from "@/app/dashboard/products/product-status-form";

export const dynamic = "force-dynamic";

// listProducts() calls requireFeature("product_catalog") — disabled for
// this tenant means FEATURE_DISABLED here, caught by
// src/app/dashboard/error.tsx, exactly like /dashboard/appearance.
export default async function ProductsListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  const authUser = await getOptionalUser();
  const context = authUser ? await resolveDashboardTenantContext(authUser.id) : null;
  if (!authUser || !context) {
    throw new AppError("TENANT_NOT_FOUND", "No store found for this account.");
  }

  const params = await searchParams;
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  const { items, total } = await listProducts(
    { tenantId: context.tenant.id, planId: context.tenant.planId },
    { page, pageSize: 20, q: params.q, status: params.status as "DRAFT" | "ACTIVE" | "ARCHIVED" | undefined }
  );

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Products</h1>
        <Link href="/dashboard/products/new" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white">
          + Add Product
        </Link>
      </div>

      <form className="mb-4 flex gap-2" method="get">
        <input
          type="text"
          name="q"
          defaultValue={params.q}
          placeholder="Search by name or SKU"
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">
          Search
        </button>
      </form>

      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-neutral-500">
            <th className="py-2">Image</th>
            <th className="py-2">Name</th>
            <th className="py-2">SKU</th>
            <th className="py-2">Price</th>
            <th className="py-2">Category</th>
            <th className="py-2">Status</th>
            <th className="py-2">Created</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((product) => (
            <tr key={product.id} className="border-b border-neutral-100">
              <td className="py-2">
                {product.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.images[0].url} alt="" className="h-10 w-10 rounded object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded bg-neutral-100" />
                )}
              </td>
              <td className="py-2">
                <Link href={`/dashboard/products/${product.id}`} className="underline">
                  {product.name}
                </Link>
              </td>
              <td className="py-2">{product.sku ?? "—"}</td>
              <td className="py-2">৳{Number(product.price).toFixed(2)}</td>
              <td className="py-2">{product.categoryLinks.map((l) => l.category.name).join(", ") || "—"}</td>
              <td className="py-2">{product.status}</td>
              <td className="py-2">{product.createdAt.toLocaleDateString()}</td>
              <td className="py-2">
                <ProductStatusForm productId={product.id} currentStatus={product.status} />
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={8} className="py-6 text-center text-neutral-400">
                No products yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="mt-4 flex gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/dashboard/products?page=${p}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`}
              className={p === page ? "font-bold underline" : "underline"}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
