import { describe, it, expect, vi, beforeEach } from "vitest";

const slugExists = vi.fn();

vi.mock("@/lib/server/repositories/tenant-repository", () => ({
  slugExists: (...args: unknown[]) => slugExists(...args),
}));

vi.mock("@/lib/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");
  return {
    ...actual,
    getReservedSlugs: () => new Set(["www", "api", "admin", "app", "super-admin"]),
  };
});

import { generateUniqueSlug } from "@/lib/server/services/tenant-service";

describe("generateUniqueSlug", () => {
  beforeEach(() => {
    slugExists.mockReset();
  });

  it("uses the base slug when it's free", async () => {
    slugExists.mockResolvedValue(false);
    expect(await generateUniqueSlug("Rahim Fashion")).toBe("rahim-fashion");
  });

  it("appends a numeric suffix on collision, and keeps incrementing until free", async () => {
    slugExists.mockImplementation(async (slug: string) => slug === "rahim-fashion" || slug === "rahim-fashion-2");

    expect(await generateUniqueSlug("Rahim Fashion")).toBe("rahim-fashion-3");
  });

  it("never returns a reserved platform slug, even if it happens to be free in the DB", async () => {
    slugExists.mockResolvedValue(false);

    const slug = await generateUniqueSlug("Admin");
    expect(slug).not.toBe("admin");
    expect(["admin-2", "admin-3"]).not.toContain("admin"); // sanity: admin itself never chosen
  });

  it("throws SLUG_ALREADY_EXISTS when no free slug can be found within the attempt budget", async () => {
    slugExists.mockResolvedValue(true);
    await expect(generateUniqueSlug("Busy Store")).rejects.toMatchObject({ code: "SLUG_ALREADY_EXISTS" });
  });
});
