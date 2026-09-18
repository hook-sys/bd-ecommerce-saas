import { listTenants } from "@/lib/server/services/tenant-admin-service";

export default async function TenantsPage() {
  const tenants = await listTenants({});

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Tenants</h1>
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-neutral-500">
            <th className="py-2">Name</th>
            <th className="py-2">Slug</th>
            <th className="py-2">Plan</th>
            <th className="py-2">Status</th>
            <th className="py-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.id} className="border-b border-neutral-100">
              <td className="py-2">{t.name}</td>
              <td className="py-2 font-mono">{t.slug}</td>
              <td className="py-2">{t.plan?.name ?? "—"}</td>
              <td className="py-2">{t.status}</td>
              <td className="py-2">{t.createdAt.toLocaleDateString()}</td>
            </tr>
          ))}
          {tenants.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-neutral-400">
                No tenants yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
