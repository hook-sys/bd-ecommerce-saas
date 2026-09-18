"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CategoryFormValues {
  id?: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
}

export function CategoryForm({ initial }: { initial?: Partial<CategoryFormValues> }) {
  const router = useRouter();
  const [values, setValues] = useState<CategoryFormValues>({
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    description: initial?.description ?? "",
    image: initial?.image ?? "",
    status: initial?.status ?? "DRAFT",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = Boolean(initial?.id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      name: values.name,
      slug: values.slug || undefined,
      description: values.description || undefined,
      image: values.image || undefined,
      status: values.status,
    };

    const res = await fetch(isEdit ? `/api/dashboard/categories/${initial!.id}` : "/api/dashboard/categories", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.message ?? "Could not save category.");
      return;
    }

    router.push("/dashboard/categories");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input
          className="rounded-md border border-neutral-300 px-3 py-2"
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          required
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Slug (optional — auto-generated from name if left blank)
        <input
          className="rounded-md border border-neutral-300 px-3 py-2"
          value={values.slug}
          onChange={(e) => setValues((v) => ({ ...v, slug: e.target.value }))}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Description
        <textarea
          className="rounded-md border border-neutral-300 px-3 py-2"
          rows={3}
          value={values.description}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Image URL
        <input
          className="rounded-md border border-neutral-300 px-3 py-2"
          value={values.image}
          onChange={(e) => setValues((v) => ({ ...v, image: e.target.value }))}
          placeholder="https://..."
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Status
        <select
          className="rounded-md border border-neutral-300 px-3 py-2"
          value={values.status}
          onChange={(e) => setValues((v) => ({ ...v, status: e.target.value as CategoryFormValues["status"] }))}
        >
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? "Saving..." : isEdit ? "Save changes" : "Create category"}
      </button>
    </form>
  );
}
