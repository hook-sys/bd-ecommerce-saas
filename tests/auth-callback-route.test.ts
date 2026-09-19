import { describe, it, expect, vi, beforeEach } from "vitest";

const exchangeCodeForSession = vi.fn();
const userUpsert = vi.fn();
const tenantUserFindFirst = vi.fn();
const provisionTenantForNewMerchant = vi.fn();
const logAuditEvent = vi.fn();

vi.mock("@/lib/server/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { exchangeCodeForSession: (...args: unknown[]) => exchangeCodeForSession(...args) },
  }),
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    user: { upsert: (...args: unknown[]) => userUpsert(...args) },
    tenantUser: { findFirst: (...args: unknown[]) => tenantUserFindFirst(...args) },
  },
}));

vi.mock("@/lib/server/services/tenant-service", () => ({
  provisionTenantForNewMerchant: (...args: unknown[]) => provisionTenantForNewMerchant(...args),
}));

vi.mock("@/lib/server/audit/audit-log-service", () => ({
  logAuditEvent: (...args: unknown[]) => logAuditEvent(...args),
}));

import { GET } from "@/app/auth/callback/route";

function makeRequest(query: string) {
  return new Request(`http://localhost:3000/auth/callback${query}`);
}

const validUser = { id: "user-1", email: "rahim@example.com", user_metadata: {} };

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    userUpsert.mockReset();
    tenantUserFindFirst.mockReset();
    provisionTenantForNewMerchant.mockReset();
    logAuditEvent.mockReset();
    tenantUserFindFirst.mockResolvedValue({ id: "membership-1" });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // TEST 1 — valid callback: session exchange succeeds, no 500, redirected
  // to `next`.
  it("exchanges the code for a session and redirects to next, with no 500", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: validUser }, error: null });
    userUpsert.mockResolvedValue({ id: "user-1" });

    const res = await GET(makeRequest("?code=valid-code&next=%2Freset-password"));

    expect(res.status).not.toBe(500);
    expect(res.headers.get("location")).toBe("http://localhost:3000/reset-password");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("valid-code");
  });

  // TEST 2 — missing code: controlled redirect, never a 500.
  it("redirects to a controlled error page when code is missing, not a 500", async () => {
    const res = await GET(makeRequest(""));

    expect(res.status).not.toBe(500);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?error=invalid_link");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  // TEST 3 — invalid/expired code: exchangeCodeForSession returns an error;
  // must be a controlled redirect, never a 500.
  it("redirects to a controlled error page when the code is invalid/expired, not a 500", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid or expired code" },
    });

    const res = await GET(makeRequest("?code=bad-code&next=%2Freset-password"));

    expect(res.status).not.toBe(500);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?error=link_expired");
    expect(userUpsert).not.toHaveBeenCalled();
  });

  // A downstream failure after a successful exchange (e.g. the database
  // rejecting the connection, matching the production incident) must also
  // be a controlled redirect, never an uncaught 500 — and must never log
  // the auth code or any session/token data.
  it("redirects safely (not 500) when a downstream database call throws after a successful exchange", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: validUser }, error: null });
    userUpsert.mockRejectedValue(new Error("Authentication failed against database server"));

    const res = await GET(makeRequest("?code=valid-code&next=%2Fdashboard"));

    expect(res.status).not.toBe(500);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?error=server_error");

    const loggedText = (console.error as ReturnType<typeof vi.fn>).mock.calls.flat().join(" ");
    expect(loggedText).not.toContain("valid-code");
  });

  // TEST 4 — safe next: an internal relative path is honored as the
  // redirect target.
  it("honors a safe internal next path", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: validUser }, error: null });
    userUpsert.mockResolvedValue({ id: "user-1" });

    const res = await GET(makeRequest("?code=valid-code&next=%2Freset-password"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/reset-password");
  });

  // TEST 5 — malicious next: an absolute external URL, a protocol-relative
  // URL, and a backslash variant (some browsers normalize "/\" to "//")
  // must all be rejected in favor of a safe internal default.
  it("rejects an external/malicious next and falls back to a safe internal destination", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: validUser }, error: null });
    userUpsert.mockResolvedValue({ id: "user-1" });

    for (const malicious of [
      "https%3A%2F%2Fevil.example.com",
      "%2F%2Fevil.example.com",
      "%2F%5Cevil.example.com",
      "javascript%3Aalert(1)",
    ]) {
      const res = await GET(makeRequest(`?code=valid-code&next=${malicious}`));
      const location = res.headers.get("location");
      expect(location).not.toContain("evil.example.com");
      expect(location).toBe("http://localhost:3000/dashboard");
    }
  });

  // TEST 6 — password recovery: the callback must not run email-verification
  // bookkeeping or tenant provisioning for a recovery flow, and must still
  // redirect to /reset-password on success so the recovery session
  // (persisted via Supabase's own cookie handling, unrelated to this
  // route's logic) is available for updateUser({ password }).
  it("skips tenant provisioning/audit-logging for a password-recovery callback and lands on /reset-password", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: validUser }, error: null });
    userUpsert.mockResolvedValue({ id: "user-1" });

    const res = await GET(makeRequest("?code=valid-code&next=%2Freset-password"));

    expect(res.headers.get("location")).toBe("http://localhost:3000/reset-password");
    expect(provisionTenantForNewMerchant).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("does run tenant provisioning/audit-logging for a normal (non-recovery) verification callback", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: { ...validUser, user_metadata: { pending_store_name: "Rahim Fashion" } } },
      error: null,
    });
    userUpsert.mockResolvedValue({ id: "user-1" });
    tenantUserFindFirst.mockResolvedValue(null);

    const res = await GET(makeRequest("?code=valid-code&next=%2Fdashboard"));

    expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard");
    expect(provisionTenantForNewMerchant).toHaveBeenCalledWith("user-1", { storeName: "Rahim Fashion" });
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.email_verified" }));
  });
});
