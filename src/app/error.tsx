"use client";

// Root-segment error boundary: covers the marketing page and the
// unauthenticated auth pages (login, register, forgot/reset password)
// against an unexpected failure (e.g. the database being unreachable)
// rendering Next.js's raw framework crash screen. Deliberately shows a
// fixed, generic message rather than `error.message` — an exception
// reaching this boundary can be a raw infrastructure error and must never
// be echoed to the visitor. Still fully captured by Next.js/Vercel's error
// reporting; this only controls what's rendered.
export default function RootError() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-neutral-600">Please try again shortly.</p>
    </main>
  );
}
