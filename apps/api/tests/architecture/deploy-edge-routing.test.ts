import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { constants, accessSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const CADDY_PATH = path.join(REPO_ROOT, "deploy/platform/Caddyfile");
const PREFLIGHT_PATH = path.join(REPO_ROOT, "deploy/platform/preflight.sh");
const SMOKE_PATH = path.join(REPO_ROOT, "deploy/platform/smoke-tenant-host.sh");
const CORS_SCRIPT_PATH = path.join(REPO_ROOT, "deploy/platform/object-storage-cors.sh");
const DEPLOY_ENV_EXAMPLE_PATH = path.join(REPO_ROOT, "deploy/platform/.env.example");
const README_PATH = path.join(REPO_ROOT, "deploy/platform/README.md");
const WORKFLOW_PATH = path.join(REPO_ROOT, ".github/workflows/deploy.yml");

const TENANT_ROOT = "tenants.example.test";
const MARKETING_HOST = "www.example.test";
const OPERATOR_HOST = "ops.example.test";
const BREAK_GLASS_HOST = "break-glass.example.test";
const CANARY_HOST = "canary." + TENANT_ROOT;
const WORKSPACE_ORIGIN = "https://ops.example.test";
const STORAGE_ENDPOINT = "https://storage.example.test";
const TLS_CERTIFICATE_FILE = "fullchain.pem";
const TLS_KEY_FILE = "privkey.pem";
const SECRET_HOST_EXPRESSION = "$" + "{{ secrets.OPERATOR_HOST }}";
const TENANT_SITE_ADDRESS = "*.{$DOMAIN_ROOT}";

const VALID_APP_ENV: Readonly<Record<string, string>> = {
  API_URL: "http://api:4000",
  DASHBOARD_URL: WORKSPACE_ORIGIN,
  TENANT_DATABASE_URL: "postgresql://app_tenant:pw@postgres:5432/business_os_dev",
  MEDIA_BUCKET: "business-os-media",
  MEDIA_S3_ENDPOINT: STORAGE_ENDPOINT,
  MEDIA_S3_REGION: "auto",
  MEDIA_S3_ACCESS_KEY_ID: "key-id",
  MEDIA_S3_SECRET_ACCESS_KEY: "secret-value",
  MEDIA_PUBLIC_BASE_URL: "https://media.example.test",
};

const VALID_DEPLOY_ENV: Readonly<Record<string, string>> = {
  DOMAIN_ROOT: TENANT_ROOT,
  MARKETING_HOST,
  OPERATOR_HOST,
  BREAK_GLASS_DOMAIN: BREAK_GLASS_HOST,
  ACME_EMAIL: "ops@example.test",
  BREAK_GLASS_CA_CERT_PATH: "/etc/caddy/break-glass-ca.pem",
  SMOKE_TENANT_HOST: CANARY_HOST,
};

const EDGE_KEYS = ["DOMAIN_ROOT", "MARKETING_HOST", "OPERATOR_HOST", "SMOKE_TENANT_HOST"] as const;
const APP_KEYS = [
  "API_URL",
  "TENANT_DATABASE_URL",
  "MEDIA_S3_ACCESS_KEY_ID",
  "MEDIA_S3_SECRET_ACCESS_KEY",
] as const;
const EDGE_SOURCE_FILE_HINT = "Caddy reads only that file";

interface CommandResult {
  readonly status: number | null;
  readonly output: string;
}

interface SiteBlock {
  readonly address: string;
  readonly body: string;
}

interface CorsHarness {
  readonly endpoint: string;
  readonly stored: () => string | null;
  readonly requests: readonly string[];
  close(): Promise<void>;
}

function readRepositoryFile(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

function countBraces(line: string): number {
  let total = 0;
  for (const character of line) {
    if (character === "{") total += 1;
    if (character === "}") total -= 1;
  }
  return total;
}

/**
 * Returns the site address of a top-level Caddyfile line, or null when the line
 * is not a site header. Only column-zero lines are sites: a nested "header {"
 * inside a snippet is not, and a snippet definition starts with "(".
 */
function siteAddress(line: string): string | null {
  if (line !== line.trimStart() || !line.trimEnd().endsWith("{")) {
    return null;
  }
  const address = line.trimEnd().slice(0, -1).trim();
  if (address.length === 0 || address.startsWith("#") || address.startsWith("(")) {
    return null;
  }
  return address;
}

/**
 * Collects the top-level site blocks of the Caddyfile: an address line followed
 * by its brace-balanced body.
 */
function siteBlocks(caddyfile: string): readonly SiteBlock[] {
  const lines = caddyfile.split("\n");
  const blocks: SiteBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const address = siteAddress(lines[index] ?? "");
    if (address === null) {
      index += 1;
      continue;
    }
    const start = index + 1;
    let depth = countBraces(lines[index] ?? "");
    index = start;
    while (index < lines.length && depth > 0) {
      depth += countBraces(lines[index] ?? "");
      index += 1;
    }
    blocks.push({ address, body: lines.slice(start, index - 1).join("\n") });
  }
  return blocks;
}

function blockAt(caddyfile: string, address: string): SiteBlock {
  const block = siteBlocks(caddyfile).find((candidate) => candidate.address === address);
  if (block === undefined) {
    throw new Error("No Caddyfile site block for " + address);
  }
  return block;
}

function withoutKey(entries: Readonly<Record<string, string>>, key: string): Record<string, string> {
  const copy: Record<string, string> = { ...entries };
  delete copy[key];
  return copy;
}

function renderEnvFile(entries: Readonly<Record<string, string>>): string {
  const lines = Object.entries(entries).map(([key, value]) => key + '="' + value + '"');
  return lines.join("\n").concat("\n");
}

function runCommand(
  command: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { env: environment, timeout: 30000 });
    const childStdout = child.stdout;
    const childStderr = child.stderr;
    let output = "";
    childStdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    childStderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, output });
    });
  });
}

function baseEnvironment(extra: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  return { PATH: process.env.PATH ?? "", ...extra };
}

/**
 * Writes one app env file and one deploy env file, plus a readable wildcard
 * certificate pair, and runs the preflight against them with an isolated
 * process environment so no ambient value can satisfy a missing key.
 */
async function runPreflight(
  app: Readonly<Record<string, string>>,
  deploy: Readonly<Record<string, string>>,
  processEnvironment: Readonly<Record<string, string>> = {}
): Promise<CommandResult> {
  const directory = mkdtempSync(path.join(tmpdir(), "bos-preflight-"));
  try {
    const tlsDirectory = path.join(directory, "tenant-tls");
    mkdirSync(tlsDirectory, { recursive: true });
    writeFileSync(path.join(tlsDirectory, TLS_CERTIFICATE_FILE), "certificate");
    writeFileSync(path.join(tlsDirectory, TLS_KEY_FILE), "key");
    const deployEntries: Record<string, string> = { ...deploy };
    if (!("TENANT_TLS_DIR" in deployEntries)) {
      deployEntries.TENANT_TLS_DIR = tlsDirectory;
    }
    const appEnv = path.join(directory, "app.env");
    const deployEnv = path.join(directory, "deploy.env");
    writeFileSync(appEnv, renderEnvFile(app));
    writeFileSync(deployEnv, renderEnvFile(deployEntries));
    return await runCommand("bash", [PREFLIGHT_PATH, appEnv, deployEnv], baseEnvironment(processEnvironment));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function runSmoke(args: readonly string[], environment: Readonly<Record<string, string>>): Promise<CommandResult> {
  return await runCommand("bash", [SMOKE_PATH, ...args], baseEnvironment(environment));
}

async function runCors(endpoint: string): Promise<CommandResult> {
  return await runCommand(
    "bash",
    [CORS_SCRIPT_PATH],
    baseEnvironment({
      MEDIA_S3_ENDPOINT: endpoint,
      MEDIA_BUCKET: "business-os-media",
      MEDIA_S3_REGION: "auto",
      MEDIA_S3_ACCESS_KEY_ID: "key-id",
      MEDIA_S3_SECRET_ACCESS_KEY: "secret-value",
      DOMAIN_ROOT: TENANT_ROOT,
      DASHBOARD_URL: WORKSPACE_ORIGIN,
    })
  );
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("error", reject);
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

function bindServer(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("The CORS test server did not bind a TCP port."));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
        return;
      }
      reject(error);
    });
  });
}

function policyXml(stored: string | null, complete: boolean): string {
  if (!complete) {
    return "<CORSConfiguration><CORSRule><AllowedOrigin>https://unexpected.test</AllowedOrigin></CORSRule></CORSConfiguration>";
  }
  return "<CORSConfiguration>" + (stored ?? "") + "</CORSConfiguration>";
}

async function startCorsServer(complete: boolean): Promise<CorsHarness> {
  let stored: string | null = null;
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const method = request.method ?? "";
    requests.push(method + " " + (request.url ?? ""));
    void readBody(request).then((body) => {
      if (method === "PUT") {
        stored = body;
        response.writeHead(200);
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": "application/xml" });
      response.end(policyXml(stored, complete));
    });
  });
  const port = await bindServer(server);
  return {
    endpoint: "http://127.0.0.1:" + String(port),
    stored: () => stored,
    requests,
    close: () => closeServer(server),
  };
}

function envExampleKeys(source: string): ReadonlyMap<string, string> {
  const keys = new Map<string, string>();
  for (const line of source.split("\n")) {
    const separator = line.indexOf("=");
    const name = line.slice(0, separator);
    if (separator < 1 || !/^[A-Z][A-Z0-9_]*$/.test(name)) {
      continue;
    }
    keys.set(name, line.slice(separator + 1).trim().replaceAll('"', ""));
  }
  return keys;
}

describe("tenant edge routing (N3)", () => {
  const caddyfile = readRepositoryFile(CADDY_PATH);

  it("serves one wildcard vhost for the whole tenant host family", () => {
    const tenant = blockAt(caddyfile, TENANT_SITE_ADDRESS);

    expect(tenant.body).toContain(
      "tls /etc/caddy/tenant-tls/fullchain.pem /etc/caddy/tenant-tls/privkey.pem"
    );
    expect(tenant.body).toContain("import security_headers");
    expect(caddyfile).toContain("Strict-Transport-Security");
  });

  it("routes the tenant root to the storefront and the workspace plane to the dashboard", () => {
    const tenant = blockAt(caddyfile, TENANT_SITE_ADDRESS);

    expect(tenant.body).toMatch(/@workspace path [^\n]*\/dashboard\*/);
    expect(tenant.body).toMatch(/@workspace path [^\n]*\/api\/\*/);
    expect(tenant.body).toMatch(/@workspace path [^\n]*\/login\*/);
    expect(tenant.body).toContain("reverse_proxy dashboard:3001");
    expect(tenant.body.indexOf("handle @workspace")).toBeLessThan(
      tenant.body.lastIndexOf("handle {")
    );
    expect(tenant.body).toContain("reverse_proxy web:3003");
    expect(blockAt(caddyfile, "{$MARKETING_HOST}").body).toContain("import security_headers");
  });

  it("declares every site address from configuration, never from a literal hostname", () => {
    const addresses = siteBlocks(caddyfile).map((block) => block.address);

    expect(addresses).toEqual([
      "{$OPERATOR_HOST}",
      "{$BREAK_GLASS_DOMAIN}",
      "{$MARKETING_HOST}",
      TENANT_SITE_ADDRESS,
    ]);
    for (const address of addresses) {
      expect(address).toMatch(/^(\*\.)?[{][$][A-Z_]+[}]$/);
    }
  });

  it("keeps the operator admission rules and the break-glass client certificate", () => {
    const operator = blockAt(caddyfile, "{$OPERATOR_HOST}");
    const breakGlass = blockAt(caddyfile, "{$BREAK_GLASS_DOMAIN}");

    expect(operator.body).toContain("reverse_proxy api:4000");
    expect(operator.body).toContain("reverse_proxy platform:3002");
    expect(operator.body).toContain("header_up -X-Break-Glass-Verified");
    expect(breakGlass.body).toContain("mode require_and_verify");
    expect(breakGlass.body).toContain('header_up X-Break-Glass-Verified "1"');
  });

  it("answers the reserved marketing host without tenant content or the workspace", () => {
    const marketing = blockAt(caddyfile, "{$MARKETING_HOST}");

    expect(marketing.body).toContain("reverse_proxy web:3003");
    expect(marketing.body).not.toContain("dashboard:3001");
    expect(marketing.body).toContain("X-Robots-Tag");
  });
});

describe("shared Next asset namespace (N3)", () => {
  const caddyfile = readRepositoryFile(CADDY_PATH);

  it("tries the workspace first and falls back to the storefront", () => {
    const tenant = blockAt(caddyfile, TENANT_SITE_ADDRESS);

    expect(tenant.body).toContain("handle /_next/*");
    expect(tenant.body).toContain("handle_response @asset_not_found");
    expect(tenant.body.indexOf("reverse_proxy dashboard:3001")).toBeLessThan(
      tenant.body.indexOf("handle_response @asset_not_found")
    );
    expect(tenant.body.indexOf("handle_response @asset_not_found")).toBeLessThan(
      tenant.body.indexOf("reverse_proxy web:3003")
    );
  });
});

describe("edge deployment gate (N3, N4, N9)", () => {
  const workflow = readRepositoryFile(WORKFLOW_PATH);

  it("runs the preflight before any container starts and the smoke check after the stack is healthy", () => {
    const preflight = workflow.indexOf("./deploy/platform/preflight.sh");
    const start = workflow.indexOf("docker compose up -d");
    const cors = workflow.indexOf("./deploy/platform/object-storage-cors.sh");
    const smoke = workflow.indexOf("./deploy/platform/smoke-tenant-host.sh");

    expect(preflight).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(start);
    expect(cors).toBeGreaterThan(start);
    expect(smoke).toBeGreaterThan(cors);
  });

  it("ships the edge artifacts to the deploy host before the remote deploy", () => {
    expect(workflow.indexOf('source: "deploy/platform"')).toBeLessThan(
      workflow.indexOf("appleboy/ssh-action")
    );
    expect(workflow).toContain("Sync Deployment Artifacts");
  });

  it("fails the workflow when the operator host secret is empty", () => {
    expect(workflow).toContain(
      "OPERATOR_HOST repository secret must hold the operator console hostname"
    );
    expect(workflow).toContain("NEXT_PUBLIC_API_URL=https://" + SECRET_HOST_EXPRESSION);
  });

  it("uses the canonical host names and retires the edge-only alias", () => {
    const deployEnvExample = readRepositoryFile(DEPLOY_ENV_EXAMPLE_PATH);

    expect(workflow).not.toContain("OPERATOR_DOMAIN");
    expect(deployEnvExample).not.toContain("OPERATOR_DOMAIN");
    expect(deployEnvExample).toContain("OPERATOR_HOST=");
  });

  it("declares every new edge value in the deploy env example", () => {
    const keys = envExampleKeys(readRepositoryFile(DEPLOY_ENV_EXAMPLE_PATH));
    const expected = [
      "DOMAIN_ROOT",
      "MARKETING_HOST",
      "OPERATOR_HOST",
      "TENANT_TLS_DIR",
      "SMOKE_TENANT_HOST",
    ];

    for (const name of expected) {
      expect(keys.get(name), name + " must be pre-declared").toBeTruthy();
    }
  });

  it("ships the three deploy scripts as executable files", () => {
    for (const script of [PREFLIGHT_PATH, SMOKE_PATH, CORS_SCRIPT_PATH]) {
      accessSync(script, constants.X_OK);
    }
  });

  it("records the three-host model decision for the marketing host", () => {
    const readme = readRepositoryFile(README_PATH);

    expect(readme).toContain("Three-host model decision");
    expect(readme).toContain("never serves tenant content");
    expect(readme).toContain("signed hand-off");
  });
});

describe("deployment preflight behaviour (N4)", () => {
  it("passes a complete deployment configuration", async () => {
    const run = await runPreflight(VALID_APP_ENV, VALID_DEPLOY_ENV);

    expect(run.status).toBe(0);
    expect(run.output).toContain("configuration is complete");
  });

  it.each(EDGE_KEYS)("blocks the deploy when the edge value %s is missing", async (name) => {
    const run = await runPreflight(VALID_APP_ENV, withoutKey(VALID_DEPLOY_ENV, name));

    expect(run.status).not.toBe(0);
    expect(run.output).toContain(name);
    expect(run.output).toContain(EDGE_SOURCE_FILE_HINT);
  });

  it.each(APP_KEYS)("blocks the deploy when the app value %s is missing", async (name) => {
    const run = await runPreflight(withoutKey(VALID_APP_ENV, name), VALID_DEPLOY_ENV);

    expect(run.status).not.toBe(0);
    expect(run.output).toContain(name + " is empty");
  });

  it("rejects a host value with a scheme instead of a bare hostname", async () => {
    const run = await runPreflight(VALID_APP_ENV, { ...VALID_DEPLOY_ENV, DOMAIN_ROOT: WORKSPACE_ORIGIN });

    expect(run.status).not.toBe(0);
    expect(run.output).toContain("must be a bare lowercase hostname");
  });

  it("rejects two host roles that name the same host", async () => {
    const run = await runPreflight(VALID_APP_ENV, { ...VALID_DEPLOY_ENV, MARKETING_HOST: OPERATOR_HOST });

    expect(run.status).not.toBe(0);
    expect(run.output).toContain("name the same host");
  });

  it("rejects a smoke host outside the tenant root", async () => {
    const run = await runPreflight(VALID_APP_ENV, {
      ...VALID_DEPLOY_ENV,
      SMOKE_TENANT_HOST: "canary.other.test",
    });

    expect(run.status).not.toBe(0);
    expect(run.output).toContain("must be a tenant host under DOMAIN_ROOT");
  });

  it("rejects a wildcard certificate directory without a usable pair", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "bos-tls-"));
    try {
      const run = await runPreflight(VALID_APP_ENV, { ...VALID_DEPLOY_ENV, TENANT_TLS_DIR: directory });

      expect(run.status).not.toBe(0);
      expect(run.output).toContain(TLS_CERTIFICATE_FILE);
      expect(run.output).toContain(TLS_KEY_FILE);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("does not accept an edge value that only lives in the root app env", async () => {
    const run = await runPreflight(VALID_APP_ENV, withoutKey(VALID_DEPLOY_ENV, "MARKETING_HOST"), {
      MARKETING_HOST,
    });

    expect(run.status).not.toBe(0);
    expect(run.output).toContain("the deploy env file must declare MARKETING_HOST");
  });
});

describe("tenant smoke check (N3)", () => {
  const script = readRepositoryFile(SMOKE_PATH);

  it("proves the tenant root, the workspace and the robots file over TLS", () => {
    expect(script).toContain('base_url="https://${host}"');
    expect(script).toContain("check_storefront_root");
    expect(script).toContain("/dashboard");
    expect(script).toContain("/robots.txt");
    expect(script).toContain("Disallow:");
    expect(script).toContain("must stay session-free");
  });

  it("loads the storefront and workspace assets through the edge", () => {
    expect(script).toContain("assert_assets_served");
    expect(script).toContain("check_workspace_signin");
    expect(script).toContain("/_next/static/");
  });

  it("refuses a workspace redirect that leaves the tenant host", () => {
    expect(script).toContain("redirected off the tenant host");
    expect(script).toContain("Location");
  });

  it("fails with a clear message when no tenant host is configured", async () => {
    const run = await runSmoke([], {});

    expect(run.status).toBe(2);
    expect(run.output).toContain("SMOKE_TENANT_HOST");
  });

  it("rejects a tenant host argument that carries a scheme", async () => {
    const run = await runSmoke([WORKSPACE_ORIGIN], {});

    expect(run.status).toBe(2);
    expect(run.output).toContain("bare lowercase hostname");
  });

  it("reads the host from SMOKE_TENANT_HOST", () => {
    expect(script).toContain("${SMOKE_TENANT_HOST:-}");
  });
});

describe("object storage CORS automation (N9)", () => {
  it("applies the policy the media adapter signs and reads it back", async () => {
    const harness = await startCorsServer(true);
    try {
      const run = await runCors(harness.endpoint);

      expect(run.status).toBe(0);
      expect(harness.requests).toEqual([
        "PUT /business-os-media?cors",
        "GET /business-os-media?cors",
      ]);
      const stored = harness.stored();
      expect(stored).not.toBeNull();
      expect(() => {
        JSON.parse(stored ?? "");
      }).not.toThrow();
      expect(stored).toContain("https://*." + TENANT_ROOT);
      expect(stored).toContain(WORKSPACE_ORIGIN);
      expect(stored).toContain("x-amz-meta-file-name");
      expect(stored).toContain("x-amz-checksum-sha256");
    } finally {
      await harness.close();
    }
  });

  it("fails the deploy when the policy did not land", async () => {
    const harness = await startCorsServer(false);
    try {
      const run = await runCors(harness.endpoint);

      expect(run.status).toBe(1);
      expect(run.output).toContain("does not contain");
    } finally {
      await harness.close();
    }
  });

  it("drops the provider checksum header in metadata mode", () => {
    const script = readRepositoryFile(CORS_SCRIPT_PATH);

    expect(script).toContain("MEDIA_S3_CHECKSUM_MODE");
    expect(script).toContain('"metadata"');
  });

  it("signs with a protected credential file instead of exposing the secret in argv", () => {
    const script = readRepositoryFile(CORS_SCRIPT_PATH);

    expect(script).toContain("--config");
    expect(script).not.toContain("--user");
  });
});
