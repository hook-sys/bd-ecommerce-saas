import { getOptionalUser } from "@/lib/server/auth/require-role";
import { resolveDashboardTenantContext } from "@/lib/server/tenant/dashboard-tenant-context";
import { getDashboardSummary } from "@/lib/server/services/dashboard-service";

export default async function DashboardHomePage() {
  // Layout above has already redirected/blocked if this isn't reachable —
  // re-resolving here just reads the same already-verified context.
  const authUser = await getOptionalUser();
  const context = authUser ? await resolveDashboardTenantContext(authUser.id) : null;
  if (!authUser || !context) return null;

  const summary = await getDashboardSummary(context);

  const rows: [string, string][] = [
    ["Store name", summary.storeName],
    ["Store status", summary.tenantStatus],
    ["Subscription status", summary.subscriptionStatus ?? "—"],
    ["Plan", summary.planName ?? "—"],
    ["Active theme", summary.activeThemeName ?? "None installed"],
    ["Account email", authUser.email],
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>
      <dl className="grid max-w-lg grid-cols-2 gap-x-6 gap-y-4 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-neutral-500">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
