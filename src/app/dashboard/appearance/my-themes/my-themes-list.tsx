"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface InstalledTheme {
  tenantThemeId: string;
  themeId: string;
  themeName: string;
  version: string;
  status: string;
}

export function MyThemesList({ items }: { items: InstalledTheme[] }) {
  const router = useRouter();
  const [activating, setActivating] = useState<string | null>(null);

  async function handleActivate(tenantThemeId: string) {
    setActivating(tenantThemeId);
    const res = await fetch("/api/dashboard/themes/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantThemeId }),
    });
    setActivating(null);
    if (res.ok) router.refresh();
  }

  if (items.length === 0) {
    return <p className="text-neutral-500">No themes installed yet. Browse the Theme Library to get started.</p>;
  }

  return (
    <ul className="flex max-w-lg flex-col gap-2">
      {items.map((item) => (
        <li
          key={item.tenantThemeId}
          className="flex items-center justify-between rounded-md border border-neutral-200 px-4 py-3"
        >
          <div>
            <div className="font-medium">{item.themeName}</div>
            <div className="text-xs text-neutral-500">
              v{item.version} · {item.status}
            </div>
          </div>
          <div className="flex gap-2 text-sm">
            <Link href={`/dashboard/appearance/themes/${item.themeId}/preview`} className="underline">
              Preview
            </Link>
            {item.status !== "ACTIVE" && (
              <button
                onClick={() => handleActivate(item.tenantThemeId)}
                disabled={activating === item.tenantThemeId}
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs disabled:opacity-50"
              >
                {activating === item.tenantThemeId ? "Activating..." : "Activate"}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
