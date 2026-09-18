import { resolveTenantContext } from "@/lib/server/tenant/tenant-context";
import { resolveStorefrontTheme, resolveSectionsForPage } from "@/lib/server/storefront/theme-runtime";
import { hydrateCatalogSections } from "@/lib/storefront/catalog-hydration";
import { SectionList } from "@/lib/storefront/storefront-renderer";
import { getStorefrontProducts } from "@/lib/server/services/storefront-catalog-service";

// The theme's "product" page section list is hydrated the same way the
// homepage is; if the theme didn't define a ProductGrid section here (or
// defined no sections at all), fall back to a plain grid of the tenant's
// active catalog so the route is never empty just because a theme is thin.
export default async function ProductListingPage() {
  const ctx = await resolveTenantContext();
  if (!ctx) return null;

  const resolution = await resolveStorefrontTheme(ctx.id);
  if (resolution.status !== "ok") return null;

  const sections = await hydrateCatalogSections(resolveSectionsForPage(resolution, "product"), { tenantId: ctx.id });

  if (sections.some((s) => s.component === "ProductGrid")) {
    return <SectionList sections={sections} />;
  }

  const { items } = await getStorefrontProducts(ctx.id, { pageSize: 24 });
  return (
    <div>
      <SectionList sections={sections} />
      <SectionList sections={[{ component: "ProductGrid", props: { heading: "All Products", items } }]} />
    </div>
  );
}
