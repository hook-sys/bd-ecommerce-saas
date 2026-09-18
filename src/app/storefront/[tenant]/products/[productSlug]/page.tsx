import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveTenantContext } from "@/lib/server/tenant/tenant-context";
import { resolveStorefrontTheme } from "@/lib/server/storefront/theme-runtime";
import { getStorefrontProductBySlug } from "@/lib/server/services/storefront-catalog-service";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string; productSlug: string }>;
}): Promise<Metadata> {
  const ctx = await resolveTenantContext();
  if (!ctx) return {};

  const { productSlug } = await params;
  const product = await getStorefrontProductBySlug(ctx.id, productSlug);
  if (!product) return {};

  const description = product.shortDescription || product.description?.slice(0, 160) || undefined;
  return {
    title: product.name,
    description,
    openGraph: product.images[0] ? { images: [{ url: product.images[0].url }] } : undefined,
  };
}

// getActiveProductBySlugForStorefront only ever matches status ACTIVE — a
// DRAFT or ARCHIVED product's slug 404s exactly like a nonexistent one, so
// this page can never leak the existence of an unpublished product.
export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ productSlug: string }>;
}) {
  const ctx = await resolveTenantContext();
  if (!ctx) return null;

  const resolution = await resolveStorefrontTheme(ctx.id);
  if (resolution.status !== "ok") return null;

  const { productSlug } = await params;
  const product = await getStorefrontProductBySlug(ctx.id, productSlug);
  if (!product) notFound();

  const onSale = product.compareAtPrice != null && product.compareAtPrice > product.price;

  return (
    <div className="mx-auto grid max-w-4xl gap-8 px-6 py-12 sm:grid-cols-2">
      <div className="aspect-square overflow-hidden rounded-md bg-neutral-100">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div>
        <h1 className="text-2xl font-bold">{product.name}</h1>
        <div className="mt-2 flex gap-2 text-lg">
          <span>৳{product.price.toFixed(2)}</span>
          {onSale && <span className="text-neutral-400 line-through">৳{product.compareAtPrice!.toFixed(2)}</span>}
        </div>
        {product.shortDescription && <p className="mt-4 text-neutral-600">{product.shortDescription}</p>}
        {product.description && <p className="mt-4 whitespace-pre-line text-sm text-neutral-600">{product.description}</p>}
        {product.categories.length > 0 && (
          <div className="mt-4 flex gap-2 text-xs text-neutral-500">
            {product.categories.map((c) => (
              <span key={c.id}>{c.name}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
