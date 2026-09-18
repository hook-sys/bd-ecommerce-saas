import { describe, it, expect, vi, beforeEach } from "vitest";

const signUp = vi.fn();
const userUpsert = vi.fn();
const logAuditEvent = vi.fn();

vi.mock("@/lib/server/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signUp: (...args: unknown[]) => signUp(...args) } }),
}));

vi.mock("@/lib/server/db/client", () => ({
  prisma: { user: { upsert: (...args: unknown[]) => userUpsert(...args) } },
}));

vi.mock("@/lib/server/audit/audit-log-service", () => ({
  logAuditEvent: (...args: unknown[]) => logAuditEvent(...args),
}));

vi.mock("@/lib/env", () => ({
  getAppOrigin: () => "https://myplatform.com",
}));

import { POST } from "@/app/api/auth/register/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = { storeName: "Rahim Fashion", email: "rahim@example.com", password: "supersecret1" };

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    signUp.mockReset();
    userUpsert.mockReset();
    logAuditEvent.mockReset();
  });

  // 1. First registration request succeeds.
  it("creates the (unconfirmed) auth user and returns 201 on a normal request", async () => {
    signUp.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(201);
    expect(userUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } })
    );
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.register" }));
  });

  // 2/3. Supabase's own per-email resend cooldown or project-wide send
  // quota (both surface as an AuthApiError with status 429, or the
  // `over_email_send_rate_limit` code) must map to a 429 response with a
  // stable, non-leaky message — never a generic 400, and never Supabase's
  // raw internal wording forwarded verbatim.
  it("maps a Supabase per-email resend cooldown (status 429) to HTTP 429, not a leaked raw message", async () => {
    signUp.mockResolvedValue({
      data: { user: null },
      error: { status: 429, message: "For security purposes, you can only request this after 40 seconds." },
    });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.message).not.toContain("40 seconds");
    expect(userUpsert).not.toHaveBeenCalled();
  });

  it("maps Supabase's project-wide email send quota (over_email_send_rate_limit) to HTTP 429", async () => {
    signUp.mockResolvedValue({
      data: { user: null },
      error: { code: "over_email_send_rate_limit", message: "email rate limit exceeded" },
    });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  // 3. Different clients are not incorrectly sharing the same cooldown:
  // this route holds no rate-limit state of its own (no shared in-memory
  // map, no shared key) — each request's outcome depends only on that
  // request's own Supabase response, so a rate-limited call for one email
  // cannot affect a concurrent/subsequent call for a different email.
  it("does not let one rate-limited request affect a later, independent request", async () => {
    signUp.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 429, message: "For security purposes, you can only request this after 40 seconds." },
    });
    const first = await POST(makeRequest({ ...validBody, email: "userA@example.com" }));
    expect(first.status).toBe(429);

    signUp.mockResolvedValueOnce({ data: { user: { id: "user-b" } }, error: null });
    const second = await POST(makeRequest({ ...validBody, email: "userB@example.com" }));
    expect(second.status).toBe(201);
  });

  // 4. A failed/unrelated request does not incorrectly block another user:
  // a validation failure (not a Supabase rate-limit response) must not be
  // reported as RATE_LIMITED, and must not prevent a subsequent, valid
  // request from succeeding.
  it("does not treat an unrelated Supabase error as a rate limit, and does not block the next request", async () => {
    signUp.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 422, message: "User already registered" },
    });
    const first = await POST(makeRequest(validBody));
    const firstBody = await first.json();
    expect(first.status).toBe(400);
    expect(firstBody.error.code).toBe("VALIDATION_ERROR");

    signUp.mockResolvedValueOnce({ data: { user: { id: "user-c" } }, error: null });
    const second = await POST(makeRequest({ ...validBody, email: "userC@example.com" }));
    expect(second.status).toBe(201);
  });

  it("rejects input missing required fields (Zod boundary) before ever calling Supabase", async () => {
    const res = await POST(makeRequest({ storeName: "X" }));
    expect(res.status).toBe(400);
    expect(signUp).not.toHaveBeenCalled();
  });
});
