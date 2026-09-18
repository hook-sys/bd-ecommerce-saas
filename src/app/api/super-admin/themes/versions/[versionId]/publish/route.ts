import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/server/auth/require-role";
import { publishThemeVersion } from "@/lib/server/services/theme-admin-service";
import { prisma } from "@/lib/server/db/client";

// Invoked from a plain <form method="post"> on the theme detail page, so
// this redirects back to that page (with an ?error= flag on failure)
// rather than returning JSON for the browser to render directly.
export async function POST(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const admin = await requireSuperAdmin();
  const { versionId } = await params;

  const version = await prisma.themeVersion.findUnique({ where: { id: versionId } });
  const themeId = version?.themeId;
  const redirectBase = new URL(themeId ? `/super-admin/themes/${themeId}` : "/super-admin/themes", request.url);

  try {
    await publishThemeVersion(versionId, admin.id);
  } catch (error) {
    redirectBase.searchParams.set("error", error instanceof Error ? error.message : "Could not publish version.");
  }

  return NextResponse.redirect(redirectBase, { status: 303 });
}
