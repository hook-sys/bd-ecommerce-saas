import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function makeRequest(url: string, host: string) {
  return new NextRequest(url, { headers: { host } });
}

describe("proxy (subdomain -> tenant rewrite)", () => {
  it("passes root-domain requests through unrewritten", async () => {
    const res = proxy(makeRequest("http://myplatform.com/", "myplatform.com"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("rewrites a tenant subdomain request into the storefront segment with the trusted header", async () => {
    const res = proxy(makeRequest("http://rahim.myplatform.com/", "rahim.myplatform.com"));
    const rewriteUrl = res.headers.get("x-middleware-rewrite");
    expect(rewriteUrl).toContain("/storefront/rahim");
  });

  it("never rewrites a direct request to the /storefront path itself (no double-rewrite)", async () => {
    const res = proxy(makeRequest("http://rahim.myplatform.com/storefront/rahim/", "rahim.myplatform.com"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("never rewrites a reserved subdomain (www) into a tenant lookup", async () => {
    const res = proxy(makeRequest("http://www.myplatform.com/", "www.myplatform.com"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("never rewrites the super-admin path even on a tenant subdomain host", async () => {
    const res = proxy(makeRequest("http://rahim.myplatform.com/super-admin", "rahim.myplatform.com"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("never rewrites /dashboard, even on a tenant subdomain host — it's a root-domain area", async () => {
    const res = proxy(makeRequest("http://rahim.myplatform.com/dashboard", "rahim.myplatform.com"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("never rewrites the auth pages (/login, /register, /verify-email, /forgot-password, /reset-password)", async () => {
    for (const path of ["/login", "/register", "/verify-email", "/forgot-password", "/reset-password"]) {
      const res = proxy(makeRequest(`http://rahim.myplatform.com${path}`, "rahim.myplatform.com"));
      expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    }
  });

  it("strips any client-supplied x-tenant-slug header so it can never be spoofed", async () => {
    const req = makeRequest("http://myplatform.com/", "myplatform.com");
    req.headers.set("x-tenant-slug", "karim");
    const res = proxy(req);
    // For the root domain the header must not be forwarded at all.
    expect(res.headers.get("x-middleware-request-x-tenant-slug")).toBeNull();
  });
});
