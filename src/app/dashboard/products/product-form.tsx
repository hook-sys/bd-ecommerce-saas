"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CategoryOption {
  id: string;
  name: string;
}

interface ProductFormValues {
  id?: string;
  name: string;
  slug: string;
  sku: string;
  shortDescription: string;
  description: string;
  price: string;
  compareAtPrice: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  featured: boolean;
  categoryIds: string[];
  imageUrl: string;
}

export function ProductForm({ initial, categories }: { initial?: Partial<ProductFormValues>; categories: CategoryOption[] }) {
  const router = useRouter();
  const [values, setValues] = useState<ProductFormValues>({
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    sku: initial?.sku ?? "",
    shortDescription: initial?.shortDescription ?? "",
    description: initial?.description ?? "",
    price: initial?.price ?? "",
    compareAtPrice: initial?.compareAtPrice ?? "",
    status: initial?.status ?? "DRAFT",
    featured: initial?.featured ?? false,
    categoryIds: initial?.categoryIds ?? [],
    imageUrl: initial?.imageUrl ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = Boolean(initial?.id);

  function toggleCategory(id: string) {
    setValues((v) => ({
      ...v,
      categoryIds: v.categoryIds.includes(id) ? v.categoryIds.filter((c) => c !== id) : [...v.categoryIds, id],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      name: values.name,
      slug: values.slug || undefined,
      sku: values.sku || undefined,
      shortDescription: values.shortDescription || undefined,
      description: values.description || undefined,
      price: Number(values.price),
      compareAtPrice: values.compareAtPrice ? Number(values.compareAtPrice) : undefined,
      status: values.status,
      featured: values.featured,
      categoryIds: values.categoryIds,
      images: values.imageUrl ? [{ url: values.imageUrl }] : [],
    };

    const res = await fetch(isEdit ? `/api/dashboard/products/${initial!.id}` : "/api/dashboard/products", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.message ?? "Could not save product.");
      return;
    }

    router.push("/dashboard/products");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Product name
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
        SKU (optional)
        <input
          className="rounded-md border border-neutral-300 px-3 py-2"
          value={values.sku}
          onChange={(e) => setValues((v) => ({ ...v, sku: e.target.value }))}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Short description
        <input
          className="rounded-md border border-neutral-300 px-3 py-2"
          value={values.shortDescription}
          onChange={(e) => setValues((v) => ({ ...v, shortDescription: e.target.value }))}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Description
        <textarea
          className="rounded-md border border-neutral-300 px-3 py-2"
          rows={4}
          value={values.description}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        />
      </label>

      <div className="flex gap-4">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Price
          <input
            type="number"
            step="0.01"
            min="0"
            className="rounded-md border border-neutral-300 px-3 py-2"
            value={values.price}
            onChange={(e) => setValues((v) => ({ ...v, price: e.target.value }))}
            required
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Compare-at price
          <input
            type="number"
            step="0.01"
            min="0"
            className="rounded-md border border-neutral-300 px-3 py-2"
            value={values.compareAtPrice}
            onChange={(e) => setValues((v) => ({ ...v, compareAtPrice: e.target.value }))}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Primary image URL
        <input
          className="rounded-md border border-neutral-300 px-3 py-2"
          value={values.imageUrl}
          onChange={(e) => setValues((v) => ({ ...v, imageUrl: e.target.value }))}
          placeholder="https://..."
        />
      </label>

      {categories.length > 0 && (
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="mb-1">Categories</legend>
          {categories.map((c) => (
            <label key={c.id} className="flex items-center gap-2">
              <input type="checkbox" checked={values.categoryIds.includes(c.id)} onChange={() => toggleCategory(c.id)} />
              {c.name}
            </label>
          ))}
        </fieldset>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.featured}
          onChange={(e) => setValues((v) => ({ ...v, featured: e.target.checked }))}
        />
        Featured
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Status
        <select
          className="rounded-md border border-neutral-300 px-3 py-2"
          value={values.status}
          onChange={(e) => setValues((v) => ({ ...v, status: e.target.value as ProductFormValues["status"] }))}
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
        {submitting ? "Saving..." : isEdit ? "Save changes" : "Create product"}
      </button>
    </form>
  );
}
