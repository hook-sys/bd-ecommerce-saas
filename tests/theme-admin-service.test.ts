import { describe, it, expect, vi, beforeEach } from "vitest";

const findUniqueThemeVersion = vi.fn();
const updateThemeVersion = vi.fn();
const updateTheme = vi.fn();
const createAuditLog = vi.fn();
const transaction = vi.fn(async (ops: unknown[]) => ops);

vi.mock("@/lib/server/db/client", () => ({
  prisma: {
    themeVersion: {
      findUnique: (...args: unknown[]) => findUniqueThemeVersion(...args),
      update: (...args: unknown[]) => updateThemeVersion(...args),
    },
    theme: { update: (...args: unknown[]) => updateTheme(...args) },
    $transaction: (...args: unknown[]) => transaction(args[0] as unknown[]),
  },
}));

vi.mock("@/lib/server/audit/audit-log-service", () => ({
  logAuditEvent: (...args: unknown[]) => createAuditLog(...args),
}));

import { publishThemeVersion } from "@/lib/server/services/theme-admin-service";

describe("publishThemeVersion — versions are immutable once published", () => {
  beforeEach(() => {
    findUniqueThemeVersion.mockReset();
    transaction.mockClear();
    createAuditLog.mockReset();
  });

  it("publishes a DRAFT version and marks the theme PUBLISHED", async () => {
    findUniqueThemeVersion.mockResolvedValue({ id: "v1", themeId: "theme-1", status: "DRAFT", version: "1.0.0" });

    await publishThemeVersion("v1", "admin-1");

    expect(transaction).toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "theme.version.publish", resourceId: "v1" })
    );
  });

  it("refuses to republish an already-published version (no in-place overwrite of an installed version)", async () => {
    findUniqueThemeVersion.mockResolvedValue({ id: "v1", themeId: "theme-1", status: "PUBLISHED", version: "1.0.0" });

    await expect(publishThemeVersion("v1", "admin-1")).rejects.toMatchObject({
      code: "THEME_VERSION_IMMUTABLE",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("throws THEME_VERSION_NOT_FOUND for an unknown version id", async () => {
    findUniqueThemeVersion.mockResolvedValue(null);
    await expect(publishThemeVersion("missing", "admin-1")).rejects.toMatchObject({
      code: "THEME_VERSION_NOT_FOUND",
    });
  });
});
