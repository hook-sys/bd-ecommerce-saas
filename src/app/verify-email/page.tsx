"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  async function handleResend() {
    if (!email) return;
    setStatus("sending");
    await fetch("/api/auth/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setStatus("sent");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold">Verify your email</h1>
      <p className="text-neutral-600">
        {email ? (
          <>
            We sent a verification link to <span className="font-medium">{email}</span>. Click it to
            activate your account and finish setting up your store.
          </>
        ) : (
          "Check your inbox for a verification link to activate your account."
        )}
      </p>
      {email && (
        <button
          onClick={handleResend}
          disabled={status !== "idle"}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50"
        >
          {status === "sent" ? "Email sent" : status === "sending" ? "Sending..." : "Resend verification email"}
        </button>
      )}
    </main>
  );
}
