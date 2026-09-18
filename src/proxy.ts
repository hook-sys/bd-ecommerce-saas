import { NextResponse, type NextRequest } from "next/server";
import { parseHost } from "@/lib/server/tenant/hostname";

// Edge middleware: the single place a request's hostname is turned into a
// tenant slug. It never queries the DB (edge runtime + latency), it only
// extracts the candidate slug and passes it downstream via a trusted
// request header; the actual tenant lookup + status check happens
// server-side in resolveTenantContext, which is the only place that reads
// this header. Client code can never set this header itself because
// middleware overwrites it unconditionally below.
const TENANT_SLUG_HEADER = "x-tenant-slug";
const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? "localhost:3000";

const PLATFORM_PATH_PREFIXES = [
  "/super-admin",
  "/api",
  "/_next",
  "/auth",
  "/dashboard",
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  // The rewrite target itself — never rewritten a second time, and a
  // direct request to it (any host) carries no x-tenant-slug header, so it
  // 404s via the normal "no tenant context" path rather than exposing
  // anything.
  "/storefront",
];

// Kept in sync with RESERVED_SLUGS in .env.example / src/lib/env.ts. Proxy
// runs on the edge and must stay dependency-light, so this is a small local
// list rather than parsing the full env-validated config; the authoritative
// check that actually blocks a merchant from claiming one of these still
// lives in TenantService.generateUniqueSlug.
const RESERVED_SUBDOMAINS = new Set(["www", "api", "admin", "app", "super-admin", "static", "assets", "mail", "ftp"]);

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? ROOT_DOMAIN;
  const { subdomain, isRootDomain } = parseHost(host, ROOT_DOMAIN);

  const requestHeaders = new Headers(request.headers);
  // Strip any client-supplied value first so it can never be spoofed.
  requestHeaders.delete(TENANT_SLUG_HEADER);

  const isPlatformPath = PLATFORM_PATH_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p));
  const isReserved = subdomain !== null && RESERVED_SUBDOMAINS.has(subdomain);

  if (subdomain && !isRootDomain && !isPlatformPath && !isReserved) {
    requestHeaders.set(TENANT_SLUG_HEADER, subdomain);

    // Route tenant requests into their own segment of the app tree so the
    // storefront has a distinct layout from the marketing site, while the
    // trusted tenant slug still only ever travels via the header above.
    // NOTE: this segment must NOT be named with a leading underscore
    // (Next.js treats `_folderName` as a "private folder" and excludes it
    // from routing entirely — an early version of this file rewrote to
    // `/_sites/...`, which silently 404'd on every request).
    const url = request.nextUrl.clone();
    url.pathname = `/storefront/${subdomain}${request.nextUrl.pathname}`;
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    // Run on everything except static assets.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
