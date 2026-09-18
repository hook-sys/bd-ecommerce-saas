import { describe, it, expect } from "vitest";
import { mergeDesignTokens, tokensToCssVariables } from "@/lib/storefront/design-tokens";
import type { DesignTokens } from "@/lib/validators/theme";

const THEME_TOKENS: DesignTokens = {
  colors: { primary: "#111827", accent: "#ff0000" },
  fonts: { body: "Inter" },
  spacing: { section: "4rem" },
  radius: { card: "8px" },
  buttons: {},
  cards: {},
};

describe("mergeDesignTokens", () => {
  it("uses the theme's own values when there is no tenant override", () => {
    const merged = mergeDesignTokens(THEME_TOKENS, undefined);
    expect(merged.colors.primary).toBe("#111827");
  });

  it("lets a tenant override a value within an approved category", () => {
    const merged = mergeDesignTokens(THEME_TOKENS, { colors: { primary: "#0000ff" } });
    expect(merged.colors.primary).toBe("#0000ff");
    // Untouched keys are preserved.
    expect(merged.colors.accent).toBe("#ff0000");
  });

  it("drops a malicious override value instead of applying it (CSS/script injection attempt)", () => {
    const merged = mergeDesignTokens(THEME_TOKENS, {
      colors: { primary: "red; } body { display:none" },
    });
    // The unsafe value is rejected — the theme's original value survives.
    expect(merged.colors.primary).toBe("#111827");
  });

  it("rejects a javascript: URL smuggled through a token value", () => {
    const merged = mergeDesignTokens(THEME_TOKENS, {
      buttons: { icon: "url(javascript:alert(1))" },
    });
    expect(merged.buttons.icon).toBeUndefined();
  });

  it("accepts a normal url() image reference", () => {
    const merged = mergeDesignTokens(THEME_TOKENS, {
      cards: { background: "url(https://cdn.example.com/bg.png)" },
    });
    expect(merged.cards.background).toBe("url(https://cdn.example.com/bg.png)");
  });
});

describe("tokensToCssVariables", () => {
  it("produces one CSS custom property per token, namespaced by category", () => {
    const vars = tokensToCssVariables(THEME_TOKENS);
    expect(vars["--colors-primary"]).toBe("#111827");
    expect(vars["--fonts-body"]).toBe("Inter");
    expect(vars["--spacing-section"]).toBe("4rem");
    expect(vars["--radius-card"]).toBe("8px");
  });

  it("never emits a category/key the platform doesn't recognize (no arbitrary CSS variable names)", () => {
    const vars = tokensToCssVariables(THEME_TOKENS);
    for (const key of Object.keys(vars)) {
      expect(key).toMatch(/^--(colors|fonts|spacing|radius|buttons|cards)-/);
    }
  });
});
