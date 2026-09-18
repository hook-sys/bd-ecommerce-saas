import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/server/auth/require-role";
import { prisma } from "@/lib/server/db/client";
import { ThemeActions } from "@/app/super-admin/themes/[themeId]/theme-actions";

export const dynamic = "force-dynamic";

export default async function ThemeDetailPage({ params }: { params: Promise<{ themeId: string }> }) {
  await requireSuperAdmin();
  const { themeId } = await params;

  const theme = await prisma.theme.findUnique({
    where: { id: themeId },
    include: { versions: { orderBy: { createdAt: "desc" } } },
  });

  if (!theme) notFound();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{theme.name}</h1>
          <p className="text-sm text-neutral-500">
            {theme.status} · {theme.accessType} · {theme.visibilityType}
          </p>
        </div>
        <ThemeActions themeId={theme.id} status={theme.status} />
      </div>

      <h2 className="mb-2 font-semibold">Versions</h2>
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-neutral-500">
            <th className="py-2">Version</th>
            <th className="py-2">Status</th>
            <th className="py-2">Published</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {theme.versions.map((v) => (
            <tr key={v.id} className="border-b border-neutral-100">
              <td className="py-2">{v.version}</td>
              <td className="py-2">{v.status}</td>
              <td className="py-2">{v.publishedAt ? v.publishedAt.toLocaleDateString() : "—"}</td>
              <td className="flex items-center gap-3 py-2">
                <Link href={`/super-admin/themes/${theme.id}/preview?version=${v.id}`} className="underline">
                  Preview
                </Link>
                {v.status === "DRAFT" && <PublishVersionButton versionId={v.id} />}
              </td>
            </tr>
          ))}
          {theme.versions.length === 0 && (
            <tr>
              <td colSpan={4} className="py-6 text-center text-neutral-400">
                No versions yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PublishVersionButton({ versionId }: { versionId: string }) {
  return (
    <form action={`/api/super-admin/themes/versions/${versionId}/publish`} method="post">
      <button type="submit" className="rounded-md border border-neutral-300 px-2 py-1 text-xs">
        Publish
      </button>
    </form>
  );
}
