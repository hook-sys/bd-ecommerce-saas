import { resolveTenantContext } from "@/lib/server/tenant/tenant-context";
import { resolveStorefrontTheme } from "@/lib/server/storefront/theme-runtime";

// Placeholder only — no cart/order logic exists yet. This exists so the
// theme runtime and routing for a "cart" page are proven out; real cart
// state arrives with the Cart/Checkout module in a later phase.
export default async function CartPage() {
  const ctx = await resolveTenantContext();
  if (!ctx) return null;

  const resolution = await resolveStorefrontTheme(ctx.id);
  if (resolution.status !== "ok") return null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="mb-2 text-2xl font-bold">Your cart</h1>
      <p className="text-neutral-500">Your cart is empty.</p>
    </div>
  );
}
