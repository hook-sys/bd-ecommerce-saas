import Link from "next/link";

// Platform marketing landing page, served on the root domain only —
// middleware never rewrites root-domain requests into the tenant tree.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Launch your online store in minutes</h1>
      <p className="text-lg text-neutral-600">
        A multi-tenant e-commerce platform built for Bangladesh. Every merchant gets their own
        store, automatically, on their own subdomain.
      </p>
      <Link
        href="/register"
        className="rounded-md bg-neutral-900 px-6 py-3 text-white transition hover:bg-neutral-700"
      >
        Create your store
      </Link>
    </main>
  );
}
