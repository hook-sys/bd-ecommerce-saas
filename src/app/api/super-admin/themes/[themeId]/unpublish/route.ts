import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/server/auth/require-role";
import { unpublishTheme } from "@/lib/server/services/theme-admin-service";

export async function POST(request: Request, { params }: { params: Promise<{ themeId: string }> }) {
  const admin = await requireSuperAdmin();
  const { themeId } = await params;
  const redirectUrl = new URL(`/super-admin/themes/${themeId}`, request.url);

  try {
    await unpublishTheme(themeId, admin.id);
  } catch (error) {
    redirectUrl.searchParams.set("error", error instanceof Error ? error.message : "Could not unpublish theme.");
  }

  return NextResponse.redirect(redirectUrl, { status: 303 });
}
