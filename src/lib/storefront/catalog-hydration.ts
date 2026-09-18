import "server-only";
import type { SectionInstance } from "@/lib/validators/theme";
import { getStorefrontProducts, getStorefrontCategories } from "@/lib/server/services/storefront-catalog-service";

// This is the enforcement of "the theme asks for products/categories, the
// platform supplies the data" (ARCHITECTURE.md "Theme -> Catalog data
// flow"). A theme's `defaultLayouts`/a tenant's layout override can place a
// ProductGrid or CategoryGrid section and suggest cosmetic props (heading,
// a result limit, "only featured") — but `items` is always overwritten
// here with a real, tenant-scoped, ACTIVE-only query result. Theme JSON
// can never supply its own `items` array or run its own query.
export async function hydrateCatalogSections(
  sections: SectionInstance[],
  context: { tenantId: string; categorySlug?: string }
): Promise<SectionInstance[]> {
  return Promise.all(
    sections.map(async (section) => {
      if (section.component === "ProductGrid") {
        const limit = typeof section.props.limit === "number" ? Math.min(section.props.limit, 24) : 8;
        const featuredOnly = section.props.featuredOnly === true;
        const { items } = await getStorefrontProducts(context.tenantId, {
          page: 1,
          pageSize: limit,
          featuredOnly,
          categorySlug: context.categorySlug,
        });
        return { ...section, props: { ...section.props, items } };
      }

      if (section.component === "CategoryGrid") {
        const items = await getStorefrontCategories(context.tenantId);
        return { ...section, props: { ...section.props, items } };
      }

      return section;
    })
  );
}
