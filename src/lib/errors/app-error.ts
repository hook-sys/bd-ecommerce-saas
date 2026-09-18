// Consistent, enumerable application errors. Route handlers catch AppError
// and map `code` to an HTTP status + user-safe message; internal details
// (stack traces, DB errors) never reach the client.
export type AppErrorCode =
  | "TENANT_NOT_FOUND"
  | "TENANT_SUSPENDED"
  | "FEATURE_DISABLED"
  | "SUBSCRIPTION_EXPIRED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "DOMAIN_NOT_VERIFIED"
  | "SLUG_ALREADY_EXISTS"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "THEME_NOT_FOUND"
  | "THEME_VERSION_NOT_FOUND"
  | "THEME_VERSION_IMMUTABLE"
  | "THEME_NOT_ELIGIBLE"
  | "THEME_NOT_INSTALLED"
  | "EMAIL_NOT_VERIFIED"
  | "INVALID_CREDENTIALS"
  | "PRODUCT_NOT_FOUND"
  | "CATEGORY_NOT_FOUND"
  | "SKU_ALREADY_EXISTS";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  TENANT_NOT_FOUND: 404,
  TENANT_SUSPENDED: 403,
  FEATURE_DISABLED: 403,
  SUBSCRIPTION_EXPIRED: 402,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  DOMAIN_NOT_VERIFIED: 409,
  SLUG_ALREADY_EXISTS: 409,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  THEME_NOT_FOUND: 404,
  THEME_VERSION_NOT_FOUND: 404,
  THEME_VERSION_IMMUTABLE: 409,
  THEME_NOT_ELIGIBLE: 403,
  THEME_NOT_INSTALLED: 409,
  EMAIL_NOT_VERIFIED: 403,
  INVALID_CREDENTIALS: 401,
  PRODUCT_NOT_FOUND: 404,
  CATEGORY_NOT_FOUND: 404,
  SKU_ALREADY_EXISTS: 409,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function toApiErrorResponse(error: unknown): { status: number; body: { error: { code: string; message: string } } } {
  if (error instanceof AppError) {
    return { status: error.status, body: { error: { code: error.code, message: error.message } } };
  }
  if (error && typeof error === "object" && "issues" in error) {
    // Zod validation error.
    return { status: 400, body: { error: { code: "VALIDATION_ERROR", message: "Invalid input." } } };
  }
  // Never leak internal error messages for unexpected errors.
  return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } } };
}
