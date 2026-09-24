import type { AuthenticatedUser } from "./domain.types";

 /* Augments Express's Request type with fields we attach via middleware.
 * Using declaration merging instead of casting to `any` keeps
 * every downstream handler fully type-safe.
 */

declare module "express-serve-static-core" {
  interface Request {
    /** UUID attached by requestIdMiddleware for distributed tracing */
    requestId?: string;
    /** Authenticated user — populated by requireAuth middleware (Phase 2) */
    user?: AuthenticatedUser;
  }
}

export {};