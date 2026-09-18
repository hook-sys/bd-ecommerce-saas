export function ThemeActions({ themeId, status }: { themeId: string; status: string }) {
  return (
    <div className="flex gap-2">
      {status === "PUBLISHED" && (
        <form action={`/api/super-admin/themes/${themeId}/unpublish`} method="post">
          <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">
            Unpublish
          </button>
        </form>
      )}
      {status !== "ARCHIVED" && (
        <form action={`/api/super-admin/themes/${themeId}/archive`} method="post">
          <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">
            Archive
          </button>
        </form>
      )}
    </div>
  );
}
