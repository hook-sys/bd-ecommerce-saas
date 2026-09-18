import Link from "next/link";
import { requireSuperAdmin } from "@/lib/server/auth/require-role";
import { prisma } from "@/lib/server/db/client";

export const dynamic = "force-dynamic";

export default async function SuperAdminThemesPage() {
  await requireSuperAdmin();

  const themes = await prisma.theme.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { tenantThemes: true, versions: true } },
    },
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Themes</h1>
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-neutral-500">
            <th className="py-2">Name</th>
            <th className="py-2">Category</th>
            <th className="py-2">Versions</th>
            <th className="py-2">Status</th>
            <th className="py-2">Access</th>
            <th className="py-2">Installs</th>
            <th className="py-2">Created</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {themes.map((theme) => (
            <tr key={theme.id} className="border-b border-neutral-100">
              <td className="py-2">{theme.name}</td>
              <td className="py-2">{theme.category ?? "—"}</td>
              <td className="py-2">{theme._count.versions}</td>
              <td className="py-2">{theme.status}</td>
              <td className="py-2">{theme.accessType}</td>
              <td className="py-2">{theme._count.tenantThemes}</td>
              <td className="py-2">{theme.createdAt.toLocaleDateString()}</td>
              <td className="py-2">
                <Link href={`/super-admin/themes/${theme.id}`} className="underline">
                  View
                </Link>
              </td>
            </tr>
          ))}
          {themes.length === 0 && (
            <tr>
              <td colSpan={8} className="py-6 text-center text-neutral-400">
                No themes yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
