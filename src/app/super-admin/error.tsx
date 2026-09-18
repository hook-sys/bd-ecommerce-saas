"use client";

export default function SuperAdminError({ error }: { error: Error & { digest?: string } }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-2xl font-bold">Access denied</h1>
      <p className="text-neutral-600">{error.message || "You do not have access to this area."}</p>
    </main>
  );
}
