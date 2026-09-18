"use client";

import { useRouter } from "next/navigation";

// Simple up/down reorder — the list is already sorted by sortOrder, so
// swapping this category's position with its neighbor and resubmitting the
// full ordered id list is enough for the MVP; no drag-and-drop library.
export function CategoryReorderButtons({ categoryId, allCategoryIds }: { categoryId: string; allCategoryIds: string[] }) {
  const router = useRouter();

  async function move(direction: -1 | 1) {
    const index = allCategoryIds.indexOf(categoryId);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= allCategoryIds.length) return;

    const reordered = [...allCategoryIds];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];

    await fetch("/api/dashboard/categories/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedCategoryIds: reordered }),
    });
    router.refresh();
  }

  return (
    <div className="flex gap-1 text-xs">
      <button onClick={() => move(-1)} aria-label="Move up">
        ↑
      </button>
      <button onClick={() => move(1)} aria-label="Move down">
        ↓
      </button>
    </div>
  );
}
