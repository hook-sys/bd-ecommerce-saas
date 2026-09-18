"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TenantMembership } from "@/lib/server/tenant/dashboard-tenant-context";

export function SwitchStoreList({ memberships }: { memberships: TenantMembership[] }) {
  const router = useRouter();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  async function handleSwitch(tenantId: string) {
    setSwitchingTo(tenantId);
    const res = await fetch("/api/dashboard/switch-tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    setSwitchingTo(null);

    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    }
  }

  if (memberships.length === 0) {
    return <p className="text-neutral-500">You don&apos;t belong to any stores yet.</p>;
  }

  return (
    <ul className="flex max-w-md flex-col gap-2">
      {memberships.map((m) => (
        <li key={m.tenantId} className="flex items-center justify-between rounded-md border border-neutral-200 px-4 py-3">
          <div>
            <div className="font-medium">{m.tenantName}</div>
            <div className="text-xs text-neutral-500">
              {m.role} · {m.tenantStatus}
            </div>
          </div>
          <button
            onClick={() => handleSwitch(m.tenantId)}
            disabled={switchingTo === m.tenantId}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {switchingTo === m.tenantId ? "Switching..." : "Switch"}
          </button>
        </li>
      ))}
    </ul>
  );
}
