import { DESIGN_TOKEN_CATEGORIES, type DesignTokens } from "@/lib/validators/theme";

// A token value becomes one CSS custom-property *value*, set via a React
// inline `style` object — never concatenated into a `<style>` block as a
// string. The DOM style API sets one declaration per key; a value
// containing `;`/`{`/`}` is just an invalid value the browser drops, it
// can't "break out" into a second declaration the way it could in a
// hand-built <style> string. The regex below is a second, defense-in-depth
// layer on top of that: anything that isn't a plausible CSS value token
// (hex color, rgb()/hsl(), length, plain word, url() to an http(s) image)
// is rejected outright rather than trusting the browser alone.
const SAFE_VALUE_PATTERN = /^[a-zA-Z0-9#%.,\-\s()]+$|^url\(https:\/\/[^)'"]+\)$/;
const DISALLOWED_SUBSTRINGS = ["javascript:", "expression(", "<", ">", "\\"];

function sanitizeTokenValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) return null;
  const lower = trimmed.toLowerCase();
  if (DISALLOWED_SUBSTRINGS.some((bad) => lower.includes(bad))) return null;
  if (!SAFE_VALUE_PATTERN.test(trimmed)) return null;
  return trimmed;
}

// Tenant overrides may only set *values* for categories the platform
// already knows about (DESIGN_TOKEN_CATEGORIES) — never introduce a new
// category/CSS-variable name. Within a category, the theme's own keys win
// unless the tenant explicitly overrides that same key.
export function mergeDesignTokens(themeTokens: DesignTokens, tenantOverrides: Partial<DesignTokens> | undefined) {
  const merged: DesignTokens = {
    colors: { ...themeTokens.colors },
    fonts: { ...themeTokens.fonts },
    spacing: { ...themeTokens.spacing },
    radius: { ...themeTokens.radius },
    buttons: { ...themeTokens.buttons },
    cards: { ...themeTokens.cards },
  };

  if (!tenantOverrides) return merged;

  for (const category of DESIGN_TOKEN_CATEGORIES) {
    const overrideCategory = tenantOverrides[category];
    if (!overrideCategory) continue;
    for (const [key, value] of Object.entries(overrideCategory)) {
      const safe = sanitizeTokenValue(value);
      if (safe) merged[category][key] = safe;
    }
  }

  return merged;
}

// Converts merged tokens into a flat set of CSS custom properties, e.g.
// `--color-primary`, `--spacing-section`, suitable for a React inline
// `style` prop on the storefront root wrapper.
export function tokensToCssVariables(tokens: DesignTokens): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const category of DESIGN_TOKEN_CATEGORIES) {
    for (const [key, value] of Object.entries(tokens[category])) {
      const safe = sanitizeTokenValue(value);
      if (!safe) continue;
      vars[`--${category}-${key}`] = safe;
    }
  }

  return vars;
}
