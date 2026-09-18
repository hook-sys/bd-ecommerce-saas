import { notFound } from "next/navigation";
import { getOptionalUser } from "@/lib/server/auth/require-role";
import { resolveDashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";
import { getProduct } from "@/lib/server/services/product-service";
import { listCategories } from "@/lib/server/services/category-service";
import { AppError } from "@/lib/errors/app-error";
import { ProductForm } from "@/app/dashboard/products/product-form";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const authUser = await getOptionalUser();
  const context = authUser ? await resolveDashboardTenantContext(authUser.id) : null;
  if (!authUser || !context) {
    throw new AppError("TENANT_NOT_FOUND", "No store found for this account.");
  }

  const { id } = await params;

  const [product, { items: categories }] = await Promise.all([
    getProduct({ tenantId: context.tenant.id, planId: context.tenant.planId }, id).catch(() => null),
    listCategories({ tenantId: context.tenant.id, planId: context.tenant.planId }, { page: 1, pageSize: 100 }),
  ]);

  if (!product) notFound();

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Edit Product</h1>
      <ProductForm
        initial={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          sku: product.sku ?? "",
          shortDescription: product.shortDescription ?? "",
          description: product.description ?? "",
          price: String(product.price),
          compareAtPrice: product.compareAtPrice != null ? String(product.compareAtPrice) : "",
          status: product.status,
          featured: product.featured,
          categoryIds: product.categoryLinks.map((l) => l.categoryId),
          imageUrl: product.images[0]?.url ?? "",
        }}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
