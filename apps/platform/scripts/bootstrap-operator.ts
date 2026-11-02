import { chmodSync, writeFileSync } from "node:fs";
import { InternalServerError } from "@suite/core/errors";
import {
  appendPlatformAuditEvent,
  createBootstrapToken,
  storeBootstrapToken,
} from "@suite/auth/platform";
import {
  createPlatformPrismaClient,
  disconnectPlatformPrismaClient,
} from "@suite/db";
import { redis } from "@suite/redis";
import { bootstrapFirstOperator } from "../src/lib/bootstrap-operator.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new InternalServerError(`${name} must be set before running the bootstrap command`);
  }
  return value;
}

function optionalName(email: string): string {
  const index = process.argv.indexOf("--name");
  const value = index >= 0 ? process.argv[index + 1]?.trim() : undefined;
  return value && value.length > 0 ? value : email.split("@")[0] ?? email;
}

function outputPath(): string {
  const index = process.argv.indexOf("--output");
  const value = index >= 0 ? process.argv[index + 1]?.trim() : undefined;
  return value && value.length > 0 ? value : ".platform-bootstrap-link";
}

async function main(): Promise<void> {
  const databaseUrl = required("PLATFORM_DATABASE_URL");
  const controlPlaneOrigin = required("CONTROL_PLANE_ORIGIN");
  const email = required("PLATFORM_BOOTSTRAP_OPERATOR_EMAIL");
  const displayName = optionalName(email);

  const prisma = createPlatformPrismaClient({ databaseUrl });
  try {
    const result = await bootstrapFirstOperator(
      {
        prisma,
        redis,
        createToken: createBootstrapToken,
        storeToken: storeBootstrapToken,
        appendAudit: appendPlatformAuditEvent,
      },
      { email, displayName }
    );

    const url = new URL("/sign-in", controlPlaneOrigin);
    url.hash = new URLSearchParams({ bootstrap: result.token }).toString();
    const destination = outputPath();
    writeFileSync(destination, `${url.toString()}\n`, { mode: 0o600 });
    chmodSync(destination, 0o600);
    console.log(`Operator ${result.email} is ready.`);
    console.log(
      `The single-use link was written to ${destination} with mode 0600.`
    );
    console.log("Open the file, then open the link within 15 minutes.");
  } finally {
    await disconnectPlatformPrismaClient(prisma);
    await redis.quit();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
