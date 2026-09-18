import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("getAppOrigin — never derived from a request's Host header", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    // Force a fresh module load per test so getServerEnv()'s internal cache
    // doesn't leak PLATFORM_ROOT_DOMAIN between cases.
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("uses http:// for a localhost PLATFORM_ROOT_DOMAIN (local dev)", async () => {
    process.env.PLATFORM_ROOT_DOMAIN = "localhost:3000";
    const { getAppOrigin } = await import("@/lib/env");
    expect(getAppOrigin()).toBe("http://localhost:3000");
  });

  it("uses https:// for a real domain — the Vercel-generated domain today, the final custom domain later, with no code change either way", async () => {
    process.env.PLATFORM_ROOT_DOMAIN = "my-saas.vercel.app";
    const { getAppOrigin } = await import("@/lib/env");
    expect(getAppOrigin()).toBe("https://my-saas.vercel.app");
  });

  it("is driven entirely by the env var — swapping it to the final domain requires no application code change", async () => {
    process.env.PLATFORM_ROOT_DOMAIN = "myplatform.com";
    const { getAppOrigin } = await import("@/lib/env");
    expect(getAppOrigin()).toBe("https://myplatform.com");
  });
});
