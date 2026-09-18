"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CategoryStatusForm({ categoryId, currentStatus }: { categoryId: string; currentStatus: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function setStatus(status: "ACTIVE" | "ARCHIVED") {
    setSubmitting(true);
    await fetch(`/api/dashboard/categories/${categoryId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setSubmitting(false);
    router.refresh();
  }

  return (
    <div className="flex gap-2 text-xs">
      {currentStatus !== "ACTIVE" && (
        <button disabled={submitting} onClick={() => setStatus("ACTIVE")} className="underline">
          Publish
        </button>
      )}
      {currentStatus !== "ARCHIVED" && (
        <button disabled={submitting} onClick={() => setStatus("ARCHIVED")} className="underline">
          Archive
        </button>
      )}
    </div>
  );
}
