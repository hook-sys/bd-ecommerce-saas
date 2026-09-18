import { describe, it, expect } from "vitest";
import { loginSchema, switchTenantSchema } from "@/lib/validators/auth";
import { registerMerchantSchema } from "@/lib/validators/tenant";

describe("registerMerchantSchema — client cannot assign role/tenantId/planId", () => {
  it("accepts a well-formed registration payload", () => {
    const result = registerMerchantSchema.parse({
      storeName: "Rahim Fashion",
      email: "rahim@example.com",
      password: "supersecret",
    });
    expect(result.storeName).toBe("Rahim Fashion");
  });

  it("rejects a payload that tries to smuggle in a role", () => {
    expect(() =>
      registerMerchantSchema.parse({
        storeName: "Rahim Fashion",
        email: "rahim@example.com",
        password: "supersecret",
        role: "SUPER_ADMIN",
      })
    ).toThrow();
  });

  it("rejects a payload that tries to smuggle in a tenantId", () => {
    expect(() =>
      registerMerchantSchema.parse({
        storeName: "Rahim Fashion",
        email: "rahim@example.com",
        password: "supersecret",
        tenantId: "some-other-tenant",
      })
    ).toThrow();
  });

  it("rejects a payload that tries to smuggle in a planId", () => {
    expect(() =>
      registerMerchantSchema.parse({
        storeName: "Rahim Fashion",
        email: "rahim@example.com",
        password: "supersecret",
        planId: "business",
      })
    ).toThrow();
  });
});

describe("loginSchema — no role/tenantId acceptance surface at all", () => {
  it("accepts only email + password", () => {
    const result = loginSchema.parse({ email: "a@example.com", password: "x" });
    expect(Object.keys(result).sort()).toEqual(["email", "password"]);
  });

  it("rejects an attempt to pass a globalRole", () => {
    expect(() => loginSchema.parse({ email: "a@example.com", password: "x", globalRole: "SUPER_ADMIN" })).toThrow();
  });
});

describe("switchTenantSchema — the tenantId here is intent, not authorization", () => {
  it("accepts a bare tenantId and nothing else", () => {
    const result = switchTenantSchema.parse({ tenantId: "123e4567-e89b-12d3-a456-426614174000" });
    expect(Object.keys(result)).toEqual(["tenantId"]);
  });

  it("rejects an attempt to also pass a role for the switch", () => {
    expect(() =>
      switchTenantSchema.parse({ tenantId: "123e4567-e89b-12d3-a456-426614174000", role: "TENANT_OWNER" })
    ).toThrow();
  });
});
