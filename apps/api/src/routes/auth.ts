import { OpenAPIHono } from "@hono/zod-openapi";
import { ValidationError } from "@suite/auth";
import { registerEmailVerificationRoutes } from "./auth/email-verification.routes.js";
import { registerSessionRoutes } from "./auth/session.routes.js";
import { registerSsoRoutes } from "./auth/sso.routes.js";
import { registerTerminalRoutes } from "./auth/terminal.routes.js";

/**
 * Identity surface composed from focused modules: session context, enterprise
 * SSO, email verification and terminal/manager PINs. Each module owns its
 * schemas and maps a service result; no module queries Prisma or Redis.
 */
export const authRouter = new OpenAPIHono({
  defaultHook: (result, _c) => {
    if (!result.success) {
      throw new ValidationError(
        "Invalid request parameters",
        result.error.errors.map((e) => ({
          name: e.path.join("."),
          reason: e.message,
        }))
      );
    }
  },
});

registerSessionRoutes(authRouter);
registerSsoRoutes(authRouter);
registerEmailVerificationRoutes(authRouter);
registerTerminalRoutes(authRouter);
