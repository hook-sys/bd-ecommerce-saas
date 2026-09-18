import { z } from "zod";

// Client input is validated against schemas that never accept a tenantId,
// role, or planId — the server derives all of those. `.strict()` makes a
// client attempt to slip one in (e.g. `role: "SUPER_ADMIN"`) fail loudly
// rather than being silently dropped.
export const registerMerchantSchema = z
  .object({
    storeName: z.string().trim().min(2, "Store name must be at least 2 characters").max(100),
    email: z.string().email(),
    password: z.string().min(8, "Password must be at least 8 characters"),
  })
  .strict();

export type RegisterMerchantInput = z.infer<typeof registerMerchantSchema>;
