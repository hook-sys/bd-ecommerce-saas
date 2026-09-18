import { redirect } from "next/navigation";
import Link from "next/link";
import { getOptionalUser } from "@/lib/server/auth/require-role";
import { resolveDashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";
import { resolveDashboardAccessDecision } from "@/lib/server/tenant/dashboard-access";
import { LogoutButton } from "@/app/dashboard/logout-button";

// Auth/tenant-dependent on every request — never statically prerendered.
export const dynamic = "force-dynamic";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/products", label: "Products", feature: "product_catalog" },
  { href: "/dashboard/categories", label: "Categories", feature: "product_catalog" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/inventory", label: "Inventory" },
  { href: "/dashboard/coupons", label: "Coupons" },
  { href: "/dashboard/appearance", label: "Appearance", feature: "theme_library" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/subscription", label: "Subscription" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const authUser = await getOptionalUser();
  const dashboardCtx = authUser ? await resolveDashboardTenantContext(authUser.id) : null;
  const decision = resolveDashboardAccessDecision({ authUser, dashboardCtx });

  if (decision.type === "redirect") {
    redirect(decision.to);
  }

  if (decision.type === "no_store") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-2xl font-bold">No store yet</h1>
        <p className="text-neutral-600">Your account isn&apos;t linked to a store.</p>
      </main>
    );
  }

  if (decision.type === "suspended") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-2xl font-bold">Store unavailable</h1>
        <p className="text-neutral-600">
          {decision.tenant.name} is currently {decision.tenant.status.toLowerCase()}. Contact support to
          reactivate your subscription.
        </p>
      </main>
    );
  }

  const { context } = decision;

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-neutral-200 px-4 py-6">
        <div className="mb-6 px-2 text-sm font-semibold">{context.tenant.name}</div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.filter((item) => !item.feature || context.effectiveFeatures[item.feature] === true).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 border-t border-neutral-200 pt-4">
          <Link href="/dashboard/switch-store" className="block px-2 py-1.5 text-sm text-neutral-500 underline">
            My Stores
          </Link>
          <LogoutButton />
        </div>
      </aside>
      <div className="flex-1 px-8 py-8">{children}</div>
    </div>
  );
}
