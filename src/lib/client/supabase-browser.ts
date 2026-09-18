"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Only the anon key is ever used here; the
// service-role key must never be imported into client-bundled code.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
