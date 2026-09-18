import { z } from "zod";

// .strict() on every one of these: an unrecognized field (e.g. a client
// trying to slip in `role` or `tenantId`) fails validation outright rather
// than being silently dropped, so a bad client request is loud, not just
// harmless. None of these schemas has a tenantId, role, or planId field —
// that's not an oversight to fix later, it's the point. See
// DEVELOPMENT_RULES.md #1.

export const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: z.string().email(),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
  })
  .strict();

export const resendVerificationSchema = z
  .object({
    email: z.string().email(),
  })
  .strict();

// The one legitimate exception to "never accept tenantId from the client":
// this tenantId is a *request* to switch context, not a grant of access to
// it. TenantSwitchService re-verifies the caller actually has a TenantUser
// row for it before honoring the request — the client's tenantId is never
// treated as authorization by itself. See DEVELOPMENT_RULES.md #1.
export const switchTenantSchema = z
  .object({
    tenantId: z.string().uuid(),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type SwitchTenantInput = z.infer<typeof switchTenantSchema>;
