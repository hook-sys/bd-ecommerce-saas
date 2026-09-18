import { renderSection } from "@/lib/storefront/component-registry";
import type { SectionInstance } from "@/lib/validators/theme";

// Shared by the live storefront pages and both preview surfaces
// (merchant + Super Admin) so "what a rendered page looks like" is defined
// in exactly one place. Unknown component keys are silently skipped by
// renderSection() — a broken/unknown section never takes the whole page
// down with it.
export function SectionList({ sections }: { sections: SectionInstance[] }) {
  return <>{sections.map((section, i) => renderSection(section, i))}</>;
}

// Used by both preview surfaces (Super Admin + merchant) to render a
// theme's homepage layout outside of any real tenant's live storefront.
// Never writes anything — rendering a preview cannot activate a theme.
export function PreviewFrame({
  bannerText,
  cssVariables,
  globalSections,
  homeSections,
}: {
  bannerText: string;
  cssVariables: Record<string, string>;
  globalSections: SectionInstance[];
  homeSections: SectionInstance[];
}) {
  return (
    <div>
      <div className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">{bannerText}</div>
      <StorefrontChrome cssVariables={cssVariables} globalSections={globalSections}>
        <SectionList sections={homeSections} />
      </StorefrontChrome>
    </div>
  );
}

export function StorefrontChrome({
  cssVariables,
  globalSections,
  children,
}: {
  cssVariables: Record<string, string>;
  globalSections: SectionInstance[];
  children: React.ReactNode;
}) {
  const header = globalSections.filter((s) => s.component === "Header");
  const footer = globalSections.filter((s) => s.component === "Footer");
  const rest = globalSections.filter((s) => s.component !== "Header" && s.component !== "Footer");

  return (
    <div style={cssVariables as React.CSSProperties} className="flex min-h-screen flex-col">
      <SectionList sections={header} />
      <SectionList sections={rest} />
      <main className="flex-1">{children}</main>
      <SectionList sections={footer} />
    </div>
  );
}
