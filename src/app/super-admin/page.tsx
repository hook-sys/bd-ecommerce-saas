import { getDashboardStats } from "@/lib/server/services/admin-dashboard-service";

export default async function SuperAdminDashboard() {
  const stats = await getDashboardStats();

  const cards = [
    { label: "Total tenants", value: stats.totalTenants },
    { label: "Active", value: stats.activeTenants },
    { label: "Trial", value: stats.trialTenants },
    { label: "Suspended", value: stats.suspendedTenants },
    { label: "New (30d)", value: stats.newRegistrations30d },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-neutral-200 p-4">
          <div className="text-sm text-neutral-500">{c.label}</div>
          <div className="text-2xl font-bold">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
