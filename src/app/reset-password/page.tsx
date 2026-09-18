import Link from "next/link";
import { getOptionalUser } from "@/lib/server/auth/require-role";
import { ResetPasswordForm } from "@/app/reset-password/reset-password-form";

export const dynamic = "force-dynamic";

// Only reachable with a valid recovery session (established by
// /auth/callback after the user clicks their emailed reset link) — without
// one, there's nothing to authorize a password change against.
export default async function ResetPasswordPage() {
  const user = await getOptionalUser();

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold">Link expired</h1>
        <p className="text-neutral-600">This password reset link is no longer valid.</p>
        <Link href="/forgot-password" className="underline">
          Request a new one
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      <ResetPasswordForm />
    </main>
  );
}
