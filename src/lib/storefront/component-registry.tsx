import type { SectionInstance } from "@/lib/validators/theme";

// The full set of components a theme is allowed to request. A theme
// package (Theme Contract) never ships its own component code — it can
// only reference one of these keys by name. This is the actual enforcement
// point for "the platform owns the runtime, the theme only supplies
// presentation/configuration": renderSection() below looks a requested key
// up here and fails safe (renders nothing) for anything not in this map,
// which is the only way a Theme Contract or tenant layout override can
// possibly affect what code runs.
type SectionProps = { props: Record<string, unknown> };

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function Hero({ props }: SectionProps) {
  return (
    <section className="flex flex-col items-center gap-4 px-6 py-20 text-center">
      <h1 className="text-4xl font-bold">{text(props.heading, "Welcome to our store")}</h1>
      <p className="max-w-xl text-neutral-600">{text(props.subheading, "")}</p>
    </section>
  );
}

function Header({ props }: SectionProps) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--colors-border,#e5e5e5)] px-6 py-4">
      <span className="font-semibold">{text(props.storeName, "Store")}</span>
      <nav className="flex gap-4 text-sm text-neutral-600">
        <span>Home</span>
        <span>Shop</span>
        <span>Cart</span>
      </nav>
    </header>
  );
}

function Footer({ props }: SectionProps) {
  return (
    <footer className="border-t border-[var(--colors-border,#e5e5e5)] px-6 py-8 text-center text-sm text-neutral-500">
      {text(props.text, `© ${new Date().getFullYear()} All rights reserved.`)}
    </footer>
  );
}

// `items` for ProductGrid/CategoryGrid is never taken from the theme
// contract or tenant settings — it is always injected by
// hydrateCatalogSections() (src/lib/storefront/catalog-hydration.ts) right
// before render, using PublicProduct/PublicCategory data resolved from
// TenantContext. A theme can ask for a ProductGrid and suggest a heading or
// a result limit; it can never supply its own query or its own catalog
// data. See ARCHITECTURE.md "Theme -> Catalog data flow".
interface ProductGridItem {
  id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
  featured: boolean;
}

function ProductGrid({ props }: SectionProps) {
  const items = Array.isArray(props.items) ? (props.items as ProductGridItem[]) : [];
  return (
    <section className="px-6 py-12">
      {props.heading ? <h2 className="mb-6 text-2xl font-semibold">{text(props.heading)}</h2> : null}
      {items.length === 0 ? (
        <p className="text-neutral-500">No products yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item) => {
            const onSale = item.compareAtPrice != null && item.compareAtPrice > item.price;
            const discountPct = onSale
              ? Math.round((1 - item.price / (item.compareAtPrice as number)) * 100)
              : 0;
            return (
              <a
                key={item.id}
                href={`/products/${item.slug}`}
                className="block rounded-md border border-neutral-200 p-3 hover:border-neutral-300"
              >
                <div className="relative mb-2 aspect-square overflow-hidden rounded bg-neutral-100">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                  ) : null}
                  {item.featured && (
                    <span className="absolute left-2 top-2 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] text-white">
                      Featured
                    </span>
                  )}
                  {onSale && (
                    <span className="absolute right-2 top-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] text-white">
                      -{discountPct}%
                    </span>
                  )}
                </div>
                <div className="text-sm font-medium">{item.name}</div>
                <div className="flex gap-2 text-sm">
                  <span>৳{item.price.toFixed(2)}</span>
                  {onSale && <span className="text-neutral-400 line-through">৳{item.compareAtPrice!.toFixed(2)}</span>}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface CategoryGridItem {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  productCount: number;
}

function CategoryGrid({ props }: SectionProps) {
  const items = Array.isArray(props.items) ? (props.items as CategoryGridItem[]) : [];
  return (
    <section className="px-6 py-12">
      {props.heading ? <h2 className="mb-6 text-2xl font-semibold">{text(props.heading)}</h2> : null}
      {items.length === 0 ? (
        <p className="text-neutral-500">No categories yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {items.map((item) => (
            <a
              key={item.id}
              href={`/categories/${item.slug}`}
              className="block rounded-md border border-neutral-200 p-4 text-center hover:border-neutral-300"
            >
              <div className="mb-2 aspect-square overflow-hidden rounded bg-neutral-100">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="text-sm font-medium">{item.name}</div>
              <div className="text-xs text-neutral-500">{item.productCount} products</div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function Banner({ props }: SectionProps) {
  return (
    <section className="px-6 py-8">
      <div className="rounded-md bg-neutral-100 px-6 py-10 text-center">{text(props.text, "")}</div>
    </section>
  );
}

function Testimonials({ props }: SectionProps) {
  const items = Array.isArray(props.items) ? (props.items as Array<{ quote?: string; author?: string }>) : [];
  return (
    <section className="px-6 py-12">
      <div className="grid gap-6 sm:grid-cols-3">
        {items.map((item, i) => (
          <blockquote key={i} className="rounded-md border border-neutral-200 p-4 text-sm">
            <p>&ldquo;{text(item.quote)}&rdquo;</p>
            <footer className="mt-2 text-neutral-500">{text(item.author)}</footer>
          </blockquote>
        ))}
      </div>
    </section>
  );
}

function FAQ({ props }: SectionProps) {
  const items = Array.isArray(props.items) ? (props.items as Array<{ question?: string; answer?: string }>) : [];
  return (
    <section className="px-6 py-12">
      <div className="mx-auto max-w-2xl divide-y divide-neutral-200">
        {items.map((item, i) => (
          <details key={i} className="py-3">
            <summary className="cursor-pointer font-medium">{text(item.question)}</summary>
            <p className="mt-2 text-sm text-neutral-600">{text(item.answer)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Newsletter({ props }: SectionProps) {
  return (
    <section className="px-6 py-12 text-center">
      <h2 className="mb-2 text-xl font-semibold">{text(props.heading, "Stay in the loop")}</h2>
      <p className="text-sm text-neutral-500">{text(props.subheading, "Sign up for updates.")}</p>
    </section>
  );
}

export const COMPONENT_REGISTRY: Record<string, (p: SectionProps) => React.ReactElement> = {
  Hero,
  Header,
  Footer,
  ProductGrid,
  CategoryGrid,
  Banner,
  Testimonials,
  FAQ,
  Newsletter,
};

export type ApprovedComponentKey = keyof typeof COMPONENT_REGISTRY;

// Fails safe: a section requesting a component that isn't in the registry
// (an uploaded theme's contract or a tenant's layout override referencing
// something unrecognized) renders nothing rather than throwing or
// evaluating anything from the section data.
export function renderSection(section: SectionInstance, key: number | string) {
  const Component = COMPONENT_REGISTRY[section.component];
  if (!Component) return null;
  return <Component key={key} props={section.props} />;
}
