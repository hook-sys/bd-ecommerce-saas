"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ThemeCard {
  id: string;
  name: string;
  category: string | null;
  accessType: string;
  latestVersionId: string | null;
}

export function ThemeLibraryList({ themes }: { themes: ThemeCard[] }) {
  const router = useRouter();
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleInstall(theme: ThemeCard) {
    if (!theme.latestVersionId) return;
    setInstalling(theme.id);
    setError(null);

    const res = await fetch("/api/dashboard/themes/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeId: theme.id, themeVersionId: theme.latestVersionId }),
    });

    setInstalling(null);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.message ?? "Could not install theme.");
      return;
    }

    router.push("/dashboard/appearance/my-themes");
    router.refresh();
  }

  if (themes.length === 0) {
    return <p className="text-neutral-500">No themes available yet.</p>;
  }

  return (
    <div>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {themes.map((theme) => (
          <div key={theme.id} className="rounded-md border border-neutral-200 p-4">
            <div className="font-medium">{theme.name}</div>
            <div className="mb-3 text-xs text-neutral-500">
              {theme.category ?? "General"} · {theme.accessType}
            </div>
            <div className="flex gap-2 text-sm">
              <Link href={`/dashboard/appearance/themes/${theme.id}/preview`} className="underline">
                Preview
              </Link>
              <button
                onClick={() => handleInstall(theme)}
                disabled={!theme.latestVersionId || installing === theme.id}
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs disabled:opacity-50"
              >
                {installing === theme.id ? "Installing..." : "Install"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
