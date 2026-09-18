"use client";

export default function DashboardError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <h1 className="text-2xl font-bold">Not available</h1>
      <p className="text-neutral-600">{error.message || "This page isn't available for your store."}</p>
    </div>
  );
}
