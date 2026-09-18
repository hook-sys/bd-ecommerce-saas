import { getOptionalUser } from "@/lib/server/auth/require-role";
import { listTenantMemberships } from "@/lib/server/tenant/dashboard-tenant-context";
import { SwitchStoreList } from "@/app/dashboard/switch-store/switch-store-list";

export const dynamic = "force-dynamic";

export default async function SwitchStorePage() {
  const authUser = await getOptionalUser();
  if (!authUser) return null;

  const memberships = await listTenantMemberships(authUser.id);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">My Stores</h1>
      <SwitchStoreList memberships={memberships} />
    </div>
  );
}
