import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveTenantContext = vi.fn();
const resolveStorefrontTheme = vi.fn();
const resolveSectionsForPage = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
}));

vi.mock("@/lib/server/tenant/tenant-context", () => ({
  resolveTenantContext: (...args: unknown[]) => resolveTenantContext(...args),
}));

vi.mock("@/lib/server/storefront/theme-runtime", () => ({
  resolveStorefrontTheme: (...args: unknown[]) => resolveStorefrontTheme(...args),
  resolveSectionsForPage: (...args: unknown[]) => resolveSectionsForPage(...args),
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: { storeSettings: { findUnique: vi.fn().mockResolvedValue(null) } },
}));

import TenantLayout from "@/app/storefront/[tenant]/layout";

// This is the app-level behavior behind "test.aladeen.app / unknown.aladeen.app"
// from the production incident: the tenant slug itself is resolved by
// middleware from the Host header (see proxy.test.ts / hostname.test.ts) —
// what's under test here is what the storefront segment does once
// resolveTenantContext() comes back, which is the actual layer where the
// production 500 surfaced (a Prisma exception thrown mid-render, with no
// error boundary above it).
describe("storefront [tenant] layout — tenant routing behavior", () => {
  beforeEach(() => {
    resolveTenantContext.mockReset();
    resolveStorefrontTheme.mockReset();
    resolveSectionsForPage.mockReset();
    notFound.mockClear();
  });

  // Part 4 #2 (unknown.aladeen.app) / Part 3: an unresolved tenant slug
  // (query succeeded, found nothing) must be a controlled 404 — never a 500.
  it("calls notFound() — a controlled 404 — when no tenant resolves for the host", async () => {
    resolveTenantContext.mockResolvedValue(null);

    await expect(TenantLayout({ children: null })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  // Part 4 #1 (test.aladeen.app): a resolved, active tenant renders normally.
  it("renders the storefront chrome for a resolved, active tenant", async () => {
    resolveTenantContext.mockResolvedValue({
      id: "tenant-test",
      slug: "test",
      name: "Test Store",
      status: "ACTIVE",
      planId: "basic",
      effectiveFeatures: {},
    });
    resolveStorefrontTheme.mockResolvedValue({
      status: "ok",
      themeName: "Default",
      themeVersionLabel: "1.0.0",
      contract: { defaultLayouts: {} },
      tenantLayouts: {},
      cssVariables: {},
    });
    resolveSectionsForPage.mockReturnValue([]);

    const result = await TenantLayout({ children: null });
    expect(result).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("shows a controlled 'store unavailable' screen for a suspended tenant, not a 404 or 500", async () => {
    resolveTenantContext.mockResolvedValue({
      id: "tenant-test",
      slug: "test",
      name: "Test Store",
      status: "SUSPENDED",
      planId: "basic",
      effectiveFeatures: {},
    });

    const result = await TenantLayout({ children: null });
    expect(result).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });

  // Part 3, explicit instruction: "Do not hide the problem with a generic
  // catch." When tenant resolution throws for a reason OTHER than "not
  // found" (e.g. a database authentication failure — the actual production
  // root cause), the layout must NOT swallow it into a 404. It must
  // propagate so Next's error boundary (src/app/storefront/[tenant]/error.tsx)
  // handles it as a real error, not a misleading "store not found".
  it("does not swallow an unexpected resolution failure (e.g. a database error) into a 404", async () => {
    resolveTenantContext.mockRejectedValue(
      new Error("Authentication failed against database server, the provided database credentials for `postgres` are not valid.")
    );

    await expect(TenantLayout({ children: null })).rejects.toThrow(/Authentication failed/);
    expect(notFound).not.toHaveBeenCalled();
  });
});
