import "server-only";
import { z } from "zod";

// Centralized, validated environment configuration. Importing this module
// anywhere throws immediately at boot if a required variable is missing,
// instead of failing much later inside a random request handler.
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  PLATFORM_ROOT_DOMAIN: z.string().min(1).default("localhost:3000"),
  RESERVED_SLUGS: z.string().default("www,api,admin,app,super-admin,static,assets,mail,ftp"),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

// Only call this from server-side code (route handlers, server components,
// middleware). It intentionally reads process.env directly rather than
// destructuring at module scope, so it fails loudly, not silently, when a
// required var is absent in a given deployment environment.
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid/missing environment variables: ${parsed.error.issues
        .map((i) => i.path.join("."))
        .join(", ")}`
    );
  }
  cached = parsed.data;
  return cached;
}

export function getReservedSlugs(): Set<string> {
  return new Set(getServerEnv().RESERVED_SLUGS.split(",").map((s) => s.trim().toLowerCase()));
}

// The single trusted "what domain is this app running on" value, driven
// entirely by PLATFORM_ROOT_DOMAIN — never from a request's Host header.
// Security-sensitive absolute URLs (Supabase emailRedirectTo/redirectTo,
// anything emailed to a user) must be built from this, not from
// `new URL(request.url).origin`: on Next.js/Vercel that origin is derived
// from the incoming Host header, which a caller can spoof. Trusting it for
// an emailed link would let an attacker redirect a victim's password-reset
// or verification link to an attacker-controlled origin.
//
// This is also the whole mechanism for staying domain-independent: set
// PLATFORM_ROOT_DOMAIN to the Vercel-generated domain today, to the final
// custom domain later — nothing else in the app changes.
export function getAppOrigin(): string {
  const domain = getServerEnv().PLATFORM_ROOT_DOMAIN;
  const isLocal = domain.startsWith("localhost") || domain.startsWith("127.0.0.1");
  return `${isLocal ? "http" : "https"}://${domain}`;
}
