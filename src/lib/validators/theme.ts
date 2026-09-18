import { z } from "zod";

// -----------------------------------------------------------------------
// The Theme Contract.
//
// A Lovable-designed theme is never uploaded-and-executed as arbitrary
// application code. What Super Admin actually saves into
// ThemeVersion.contract is a validated, declarative description of the
// theme: what pages/components/sections it provides and what it exposes as
// merchant-configurable settings. The platform's own storefront renderer
// (built in a later phase) is what interprets this contract against real
// tenant data — the theme package supplies presentation/config, never
// server access. This is what makes "upload a theme" safe.
// -----------------------------------------------------------------------

// Every category here becomes a fixed, platform-known set of CSS custom
// properties (see src/lib/storefront/design-tokens.ts) — a theme or a
// tenant can only ever set *values* within these categories, never invent
// new CSS property names or inject raw CSS/markup. This is what "safe
// design tokens" means in practice.
const designTokensSchema = z.object({
  colors: z.record(z.string(), z.string()).default({}),
  fonts: z.record(z.string(), z.string()).default({}),
  spacing: z.record(z.string(), z.string()).default({}),
  radius: z.record(z.string(), z.string()).default({}),
  buttons: z.record(z.string(), z.string()).default({}),
  cards: z.record(z.string(), z.string()).default({}),
});

export type DesignTokens = z.infer<typeof designTokensSchema>;
export const DESIGN_TOKEN_CATEGORIES = ["colors", "fonts", "spacing", "radius", "buttons", "cards"] as const;

const themeComponentSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
});

const themeSectionSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  // Which pages this section can be placed on, e.g. ["home", "product"].
  allowedPages: z.array(z.string()).default([]),
});

const configurableSettingSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "color", "image", "url", "boolean", "select"]),
  options: z.array(z.string()).optional(), // for type: "select"
  defaultValue: z.unknown().optional(),
});

// One instance of a section placed on a page: which approved platform
// component renders it, plus the props to pass. `component` is checked
// against the platform's component registry only at render time
// (src/lib/storefront/component-registry.tsx) — not here, so this schema
// doesn't need to depend on the UI layer — and an unrecognized value is
// dropped, never executed. This is the whole "controlled component
// registry" mechanism: a theme can only ever request one of a fixed set of
// platform-built components, never ship its own.
export const sectionInstanceSchema = z.object({
  component: z.string().min(1),
  props: z.record(z.string(), z.unknown()).default({}),
});

export type SectionInstance = z.infer<typeof sectionInstanceSchema>;

// Page keys a theme/tenant can define a section list for. "global" is the
// site chrome (header/footer) rendered on every page, not a routable page.
export const STOREFRONT_PAGE_KEYS = ["global", "home", "product", "category", "cart"] as const;
export type StorefrontPageKey = (typeof STOREFRONT_PAGE_KEYS)[number];

export const themeContractSchema = z.object({
  metadata: z.object({
    name: z.string().min(1),
    author: z.string().optional(),
    description: z.string().optional(),
  }),
  supportedPages: z.array(z.string()).min(1), // e.g. ["home", "product", "category", "cart", "checkout"]
  components: z.array(themeComponentSchema).default([]),
  sections: z.array(themeSectionSchema).default([]),
  configurableSettings: z.array(configurableSettingSchema).default([]),
  designTokens: designTokensSchema,
  // The theme's own default section arrangement per page — what renders
  // before any tenant customization. Tenant-owned TenantThemeSettings.layouts
  // (see tenantThemeSettingsShapeSchema below) overrides this per page,
  // never the other way around.
  defaultLayouts: z.record(z.string(), z.array(sectionInstanceSchema)).default({}),
});

export type ThemeContract = z.infer<typeof themeContractSchema>;

// -----------------------------------------------------------------------
// Super Admin (theme management) input schemas. None of these accept a
// tenantId — global theme records are never tenant-scoped.
// -----------------------------------------------------------------------

export const createThemeSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().max(2000).optional(),
  category: z.string().max(50).optional(),
  thumbnailUrl: z.string().url().optional(),
  accessType: z.enum(["FREE", "PREMIUM"]).default("FREE"),
});

export const createThemeVersionSchema = z.object({
  themeId: z.string().uuid(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Version must be semver, e.g. 1.0.0"),
  contract: themeContractSchema,
  packagePath: z.string().min(1).optional(),
  previewImageUrl: z.string().url().optional(),
  changelog: z.string().max(2000).optional(),
});

export const setThemeVisibilitySchema = z.object({
  themeId: z.string().uuid(),
  visibilityType: z.enum(["ALL", "SELECTED_PLANS", "SELECTED_TENANTS"]),
  planIds: z.array(z.string().uuid()).optional(),
  tenantIds: z.array(z.string().uuid()).optional(),
});

// -----------------------------------------------------------------------
// Tenant-facing input schemas. Scoped tenantId is resolved server-side from
// TenantContext, never accepted here.
// -----------------------------------------------------------------------

export const installThemeSchema = z.object({
  themeId: z.string().uuid(),
  themeVersionId: z.string().uuid(),
});

export const activateThemeSchema = z.object({
  tenantThemeId: z.string().uuid(),
});

// The structured parts of a tenant's theme settings blob — the parts that
// actually get interpreted as CSS custom properties or component
// instantiation at render time, and therefore the parts that need real
// validation. Everything else (logo URL, social links, contact info, banner
// image URLs, etc. — DEVELOPMENT_RULES.md's "Theme Settings" list) is opaque
// data that trusted platform components display as plain text/props; it is
// never parsed as CSS or executed, so it stays loosely typed here.
export const tenantThemeSettingsShapeSchema = z
  .object({
    designTokens: designTokensSchema.partial().optional(),
    layouts: z.record(z.string(), z.array(sectionInstanceSchema)).optional(),
  })
  .catchall(z.unknown());

export const updateTenantThemeSettingsSchema = z.object({
  tenantThemeId: z.string().uuid(),
  settings: tenantThemeSettingsShapeSchema,
});
