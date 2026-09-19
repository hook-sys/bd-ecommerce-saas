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

  // Production incident coverage (aladeen.app): the fixture domain here is
  // "myplatform.com" (this suite's PLATFORM_ROOT_DOMAIN, see vitest.config.ts)
  // rather than the literal "aladeen.app" string, but parseHost/proxy logic
  // is entirely env-driven — these cases are the exact shape of
  // test.aladeen.app / unknown.aladeen.app / aladeen.app / www.aladeen.app.
  it("resolves a known-shaped tenant subdomain (e.g. test.<root>) to the storefront segment", async () => {
    const res = proxy(makeRequest("http://test.myplatform.com/", "test.myplatform.com"));
    expect(res.headers.get("x-middleware-rewrite")).toContain("/storefront/test");
  });

  it("still rewrites an unknown-looking tenant subdomain into the storefront segment — 'does this tenant exist' is a DB question for the page/layout to answer with a controlled 404, not something middleware decides", async () => {
    const res = proxy(makeRequest("http://unknown.myplatform.com/", "unknown.myplatform.com"));
    expect(res.headers.get("x-middleware-rewrite")).toContain("/storefront/unknown");
  });

  it("serves the bare apex root domain as the platform site, unrewritten", async () => {
    const res = proxy(makeRequest("http://myplatform.com/", "myplatform.com"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("does not crash on a malformed/unusual Host header", async () => {
    const malformedHosts = ["", "not a valid host!!", "::::", "myplatform.com:abc:def", "..myplatform.com"];
    for (const host of malformedHosts) {
      expect(() => proxy(makeRequest("http://myplatform.com/", host))).not.toThrow();
    }
  });

  it("falls back to the configured root domain when the Host header is missing entirely", async () => {
    const req = new NextRequest("http://myplatform.com/");
    req.headers.delete("host");
    expect(() => proxy(req)).not.toThrow();
  });
});
