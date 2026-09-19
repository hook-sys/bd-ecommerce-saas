"use client";

// Catches genuinely unexpected failures in tenant resolution/rendering
// (e.g. the database being unreachable) — distinct from "tenant not
// found", which is a controlled 404 via notFound() in layout.tsx and never
// reaches this boundary. Deliberately does NOT render `error.message`:
// unlike the curated AppError messages shown elsewhere in the dashboard/
// super-admin error boundaries, an exception here can be a raw
// infrastructure error (e.g. a Prisma/database error) that must never be
// echoed to a storefront visitor. The error itself is still fully captured
// by Next.js/Vercel's error reporting — this only controls what's rendered.
export default function StorefrontError() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-neutral-600">This store couldn&apos;t be loaded right now. Please try again shortly.</p>
    </main>
  );
}
