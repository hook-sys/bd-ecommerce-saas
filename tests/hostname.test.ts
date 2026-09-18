import { describe, it, expect } from "vitest";
import { parseHost, isValidSlug, slugify } from "@/lib/server/tenant/hostname";

const ROOT = "myplatform.com";

describe("parseHost", () => {
  it("recognizes the root domain", () => {
    expect(parseHost("myplatform.com", ROOT)).toEqual({
      subdomain: null,
      isRootDomain: true,
      hostname: "myplatform.com",
    });
  });

  it("recognizes www as a plain non-tenant hostname (not stripped as a tenant subdomain)", () => {
    const result = parseHost("www.myplatform.com", ROOT);
    // www resolves as a subdomain label by pure hostname parsing; reservation
    // is enforced separately by the reserved-slugs list, not by this parser.
    expect(result.subdomain).toBe("www");
  });

  it("extracts a single-level tenant subdomain", () => {
    expect(parseHost("rahim.myplatform.com", ROOT)).toEqual({
      subdomain: "rahim",
      isRootDomain: false,
      hostname: "rahim.myplatform.com",
    });
    expect(parseHost("karim.myplatform.com", ROOT).subdomain).toBe("karim");
  });

  it("strips the port before comparing hosts", () => {
    expect(parseHost("rahim.myplatform.com:3000", "myplatform.com:3000").subdomain).toBe("rahim");
  });

  it("does not treat a multi-level label as a tenant subdomain", () => {
    expect(parseHost("a.b.myplatform.com", ROOT).subdomain).toBeNull();
  });

  it("does not treat an unrelated domain as a subdomain of the platform", () => {
    expect(parseHost("evil-myplatform.com", ROOT)).toEqual({
      subdomain: null,
      isRootDomain: false,
      hostname: "evil-myplatform.com",
    });
  });
});

describe("slugify / isValidSlug", () => {
  it("produces a URL-safe slug from a store name", () => {
    expect(slugify("Rahim Fashion")).toBe("rahim-fashion");
    expect(slugify("  ABC   Store!! ")).toBe("abc-store");
  });

  it("rejects slugs with invalid characters or edge dashes", () => {
    expect(isValidSlug("rahim-fashion")).toBe(true);
    expect(isValidSlug("-rahim")).toBe(false);
    expect(isValidSlug("rahim-")).toBe(false);
    expect(isValidSlug("Rahim")).toBe(false); // must be lowercase
    expect(isValidSlug("ra_him")).toBe(false);
  });
});
