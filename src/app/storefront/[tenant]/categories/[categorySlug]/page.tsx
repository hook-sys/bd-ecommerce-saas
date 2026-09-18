import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveTenantContext } from "@/lib/server/tenant/tenant-context";
import { resolveStorefrontTheme, resolveSectionsForPage } from "@/lib/server/storefront/theme-runtime";
import { hydrateCatalogSections } from "@/lib/storefront/catalog-hydration";
import { SectionList } from "@/lib/storefront/storefront-renderer";
import { getStorefrontCategoryBySlug, getStorefrontProducts } from "@/lib/server/services/storefront-catalog-service";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ categorySlug: string }>;
}): Promise<Metadata> {
  const ctx = await resolveTenantContext();
  if (!ctx) return {};

  const { categorySlug } = await params;
  const category = await getStorefrontCategoryBySlug(ctx.id, categorySlug);
  if (!category) return {};

  return {
    title: category.name,
    description: category.name,
    openGraph: category.imageUrl ? { images: [{ url: category.imageUrl }] } : undefined,
  };
}

// A DRAFT/ARCHIVED category's slug 404s exactly like a nonexistent one —
// getStorefrontCategoryBySlug only ever matches status ACTIVE.
export default async function CategoryPage({ params }: { params: Promise<{ categorySlug: string }> }) {
  const { categorySlug } = await params;
  const ctx = await resolveTenantContext();
  if (!ctx) return null;

  const resolution = await resolveStorefrontTheme(ctx.id);
  if (resolution.status !== "ok") return null;

  const category = await getStorefrontCategoryBySlug(ctx.id, categorySlug);
  if (!category) notFound();

  const sections = await hydrateCatalogSections(resolveSectionsForPage(resolution, "category"), {
    tenantId: ctx.id,
    categorySlug,
  });

  const hasProductGrid = sections.some((s) => s.component === "ProductGrid");

  const fallbackSections = hasProductGrid
    ? []
    : [
        {
          component: "ProductGrid",
          props: { heading: category.name, items: (await getStorefrontProducts(ctx.id, { categorySlug, pageSize: 24 })).items },
        },
      ];

  return (
    <div>
      <h1 className="px-6 pt-8 text-2xl font-bold">{category.name}</h1>
      {category.description && <p className="px-6 pt-2 text-neutral-600">{category.description}</p>}
      <SectionList sections={sections} />
      <SectionList sections={fallbackSections} />
    </div>
  );
}
