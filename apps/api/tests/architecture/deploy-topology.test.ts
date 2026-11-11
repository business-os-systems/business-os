import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const COMPOSE_PATH = path.join(REPO_ROOT, "deploy/platform/docker-compose.yml");
const WORKFLOW_PATH = path.join(REPO_ROOT, ".github/workflows/deploy.yml");

const APPLICATION_SERVICES = ["api", "dashboard", "web", "platform"] as const;
const INFRASTRUCTURE_SERVICES = ["postgres", "redis"] as const;
const EDGE_SERVICE = "caddy";

interface ServiceBlock {
  readonly name: string;
  readonly body: string;
}

function readCompose(): string {
  return readFileSync(COMPOSE_PATH, "utf8");
}

function readWorkflow(): string {
  return readFileSync(WORKFLOW_PATH, "utf8");
}

/**
 * Collects the 2-space-indented keys of the top-level `services:` mapping and
 * the body of each one. The compose file is deliberately simple YAML, so a
 * block scan is exact here and avoids adding a YAML dependency for one test.
 */
function serviceBlocks(compose: string): readonly ServiceBlock[] {
  const lines = compose.split("\n");
  const start = lines.findIndex((line) => line === "services:");
  if (start === -1) {
    return [];
  }
  const blocks: ServiceBlock[] = [];
  let current: { name: string; body: string[] } | null = null;
  for (const line of lines.slice(start + 1)) {
    if (line.length > 0 && !line.startsWith(" ")) {
      break;
    }
    const header = /^ {2}([a-z][a-z0-9-]*):$/.exec(line);
    if (header !== null) {
      if (current !== null) {
        blocks.push({ name: current.name, body: current.body.join("\n") });
      }
      current = { name: header[1] ?? "", body: [] };
      continue;
    }
    if (current !== null) {
      current.body.push(line);
    }
  }
  if (current !== null) {
    blocks.push({ name: current.name, body: current.body.join("\n") });
  }
  return blocks;
}

function serviceNames(compose: string): readonly string[] {
  return serviceBlocks(compose).map((block) => block.name);
}

function blockFor(compose: string, service: string): ServiceBlock {
  const block = serviceBlocks(compose).find((candidate) => candidate.name === service);
  if (block === undefined) {
    throw new Error("No compose service named " + service);
  }
  return block;
}

function readDockerfilePath(body: string): string | null {
  const match = /^\s*dockerfile:\s*(.+)$/m.exec(body);
  return match === null ? null : (match[1] ?? "").trim();
}

function readBuildTarget(body: string): string | null {
  const match = /^\s*target:\s*(.+)$/m.exec(body);
  return match === null ? null : (match[1] ?? "").trim();
}

function publishedImageNames(compose: string): readonly string[] {
  return serviceBlocks(compose)
    .map((block) => /^\s*image:\s*\S+\/(business-os-[a-z-]+):/m.exec(block.body))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1] ?? "");
}

function workflowImageNames(workflow: string): readonly string[] {
  return [...workflow.matchAll(/IMAGE_PREFIX\s*\}\}\/(business-os-[a-z-]+):latest/g)].map(
    (match) => match[1] ?? ""
  );
}

function pulledServiceNames(workflow: string): readonly string[] {
  const match = /^\s*docker compose pull (.+)$/m.exec(workflow);
  if (match === null) {
    return [];
  }
  return (match[1] ?? "").trim().split(/\s+/);
}

describe("deployment topology (N1, N2)", () => {
  it("runs the four applications and the edge proxy", () => {
    expect(serviceNames(readCompose())).toEqual(
      expect.arrayContaining([
        ...APPLICATION_SERVICES,
        ...INFRASTRUCTURE_SERVICES,
        EDGE_SERVICE,
      ])
    );
  });

  it("pulls only services the compose file defines, and pulls every application", () => {
    const compose = readCompose();
    const pulled = pulledServiceNames(readWorkflow());

    expect(pulled).toEqual([...APPLICATION_SERVICES]);
    for (const service of pulled) {
      expect(serviceNames(compose)).toContain(service);
    }
  });

  it("pushes exactly the images the stack runs, so no image is built unused", () => {
    const compose = readCompose();
    const pushed = workflowImageNames(readWorkflow());
    const used = publishedImageNames(compose);

    expect([...pushed].sort()).toEqual([...used].sort());
    expect(new Set(pushed).size).toBe(pushed.length);
  });

  it("gives every application a published image, a healthcheck and a real Dockerfile", () => {
    const compose = readCompose();

    for (const service of APPLICATION_SERVICES) {
      const block = blockFor(compose, service);
      expect(block.body).toMatch(/^\s*image:\s*ghcr\.io\/\S+$/m);
      expect(block.body).toMatch(/^\s*healthcheck:$/m);
      const dockerfile = readDockerfilePath(block.body);
      expect(dockerfile, service + " must declare build.dockerfile").not.toBeNull();
      const dockerfilePath = path.join(REPO_ROOT, dockerfile ?? "");
      expect(existsSync(dockerfilePath), dockerfile + " must exist").toBe(true);
      const target = readBuildTarget(block.body);
      if (target !== null) {
        expect(readFileSync(dockerfilePath, "utf8")).toContain("AS " + target);
      }
    }
  });

});

describe("container definitions (N1)", () => {
  it("builds each application from its own Dockerfile", () => {
    const compose = readCompose();

    expect(readDockerfilePath(blockFor(compose, "api").body)).toBe("apps/api/Dockerfile");
    expect(readDockerfilePath(blockFor(compose, "dashboard").body)).toBe(
      "apps/dashboard/Dockerfile"
    );
    expect(readDockerfilePath(blockFor(compose, "web").body)).toBe("apps/web/Dockerfile");
    expect(readDockerfilePath(blockFor(compose, "platform").body)).toBe(
      "deploy/platform/Dockerfile"
    );
  });

});

describe("deploy gate (N2)", () => {
  it("builds the storefront image for the storefront package", () => {
    const dockerfile = readFileSync(path.join(REPO_ROOT, "apps/web/Dockerfile"), "utf8");

    expect(dockerfile).toContain("turbo prune @suite/web");
    expect(dockerfile).toContain("EXPOSE 3003");
  });

  it("refuses to finish a deploy unless every application answers its healthcheck", () => {
    const workflow = readWorkflow();

    expect(workflow).toContain("did not become healthy");
    expect(workflow).toContain("for service in api dashboard web platform");
    expect(workflow).toContain("docker compose ps --format '{{.Health}}'");
  });
});

describe("edge configuration (N3, N4)", () => {
  it("mounts the wildcard tenant certificate read-only", () => {
    const edge = blockFor(readCompose(), "caddy");

    expect(edge.body).toContain("${TENANT_TLS_DIR:?");
    expect(edge.body).toContain(":/etc/caddy/tenant-tls:ro");
  });

  it("fails the deploy instead of mounting an empty certificate path", () => {
    const edge = blockFor(readCompose(), "caddy");

    expect(edge.body).not.toContain("${TENANT_TLS_DIR:-");
    expect(edge.body).not.toContain("${TENANT_TLS_DIR}");
  });

  it("bakes the canonical operator host into the console build, failing when unset", () => {
    const console = blockFor(readCompose(), "platform");

    expect(console.body).toContain("NEXT_PUBLIC_API_URL: https://${OPERATOR_HOST:?");
    expect(console.body).not.toContain("OPERATOR_DOMAIN");
  });
});
