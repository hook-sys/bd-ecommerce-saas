import { requireSuperAdmin } from "@/lib/server/auth/require-role";

// Auth/DB-dependent on every request — never statically prerendered.
export const dynamic = "force-dynamic";

// Completely separate area from tenant stores and the merchant admin,
// gated on the global SUPER_ADMIN role (never a tenant-scoped role).
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 px-6 py-4">
        <span className="font-semibold">Super Admin</span>
      </header>
      <div className="px-6 py-8">{children}</div>
    </div>
  );
}
