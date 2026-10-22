import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getAppVersion, getGitCommitSha, getBuildTimestamp, getNodeEnv } from "../lib/env.js";

export const systemRouter = new OpenAPIHono();

export const systemVersionResponseSchema = z.object({
  version: z.string().openapi({ description: "Semantic application version", example: "0.0.1" }),
  gitCommitSha: z.string().openapi({ description: "Authoritative Git commit SHA", example: "dev" }),
  buildTimestamp: z
    .string()
    .openapi({ description: "Build timestamp in ISO 8601", example: "2026-10-22T00:00:00Z" }),
  environment: z
    .string()
    .openapi({ description: "Current execution environment", example: "development" }),
  status: z.string().openapi({ description: "System operational status", example: "ok" }),
});

export const getSystemVersionRoute = createRoute({
  method: "get",
  path: "/version",
  tags: ["System Version & Release Telemetry"],
  summary: "Get authoritative system version and build metadata",
  description:
    "Returns current semantic version, git commit SHA, build timestamp, and environment for operations and super-dashboard telemetry.",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: systemVersionResponseSchema,
        },
      },
      description: "Authoritative build and version metadata retrieved successfully.",
    },
  },
});

systemRouter.openapi(getSystemVersionRoute, (c) => {
  return c.json(
    {
      version: getAppVersion(),
      gitCommitSha: getGitCommitSha(),
      buildTimestamp: getBuildTimestamp(),
      environment: getNodeEnv(),
      status: "ok",
    },
    200
  );
});
