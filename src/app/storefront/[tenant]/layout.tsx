import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { resolveTenantContext } from "@/lib/server/tenant/tenant-context";
import { resolveStorefrontTheme, resolveSectionsForPage } from "@/lib/server/storefront/theme-runtime";
import { StorefrontChrome } from "@/lib/storefront/storefront-renderer";
import { prisma } from "@/lib/server/db/client";

// Resolved per-request from the Host header — never statically prerendered.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await resolveTenantContext();
  if (!ctx) return {};

  const storeSettings = await prisma.storeSettings.findUnique({ where: { tenantId: ctx.id } });

  const title = storeSettings?.metaTitle || ctx.name;
  const description = storeSettings?.metaDescription || `Shop at ${ctx.name}.`;

  return {
    title,
    description,
    icons: storeSettings?.faviconUrl ? [{ url: storeSettings.faviconUrl }] : undefined,
    openGraph: {
      title,
      description,
      images: storeSettings?.ogImageUrl ? [{ url: storeSettings.ogImageUrl }] : undefined,
    },
  };
}

// Every route under this segment resolves the tenant exactly once, from the
// server-trusted header set by Proxy — not from the `[tenant]` route
// param, which is only used for readable URLs/debugging, never trusted for
// data access.
export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  const ctx = await resolveTenantContext();

  if (!ctx) {
    notFound();
  }

  if (ctx.status === "SUSPENDED" || ctx.status === "CANCELLED") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-2xl font-bold">Store unavailable</h1>
        <p className="text-neutral-600">This store is temporarily unavailable. Please check back later.</p>
      </main>
    );
  }

  const resolution = await resolveStorefrontTheme(ctx.id);

  if (resolution.status === "no_active_theme") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-2xl font-bold">{ctx.name}</h1>
        <p className="text-neutral-600">Choose a theme to launch your store.</p>
      </main>
    );
  }

  if (resolution.status === "theme_not_found" || resolution.status === "invalid_contract") {
    // A data-integrity state that should never normally occur — never a
    // stack trace to the customer, just a generic "coming soon" screen.
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-2xl font-bold">{ctx.name}</h1>
        <p className="text-neutral-600">This store is being set up. Please check back soon.</p>
      </main>
    );
  }

  const globalSections = resolveSectionsForPage(resolution, "global");

  return (
    <StorefrontChrome cssVariables={resolution.cssVariables} globalSections={globalSections}>
      {children}
    </StorefrontChrome>
  );
}
