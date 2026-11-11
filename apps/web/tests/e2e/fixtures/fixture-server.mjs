import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Deterministic release-gate fixture API (T124/T125).
 *
 * The storefront renders real screens; only its upstream read contract is
 * served here, so no test reaches a real network or a developer database.
 */

const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.E2E_FIXTURE_PORT ?? "4310");
const TENANT_HOST = "acme.localhost";

const PAGES = new Map([
  ["/", JSON.parse(readFileSync(join(FIXTURE_DIR, "storefront-home.json"), "utf8"))],
  ["/about", JSON.parse(readFileSync(join(FIXTURE_DIR, "storefront-about.json"), "utf8"))],
  ["/contact", JSON.parse(readFileSync(join(FIXTURE_DIR, "storefront-contact.json"), "utf8"))],
]);
const RESOLVE = JSON.parse(readFileSync(join(FIXTURE_DIR, "storefront-resolve.json"), "utf8"));

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function readQuery(requestUrl) {
  return new URL(requestUrl, "http://127.0.0.1").searchParams;
}

function handlePage(request, response) {
  const params = readQuery(request.url);
  if (params.get("host") !== TENANT_HOST) {
    sendJson(response, 404, { code: "SITE_NOT_FOUND" });
    return;
  }
  const page = PAGES.get(params.get("path"));
  if (page === undefined) {
    sendJson(response, 404, { code: "PAGE_NOT_FOUND" });
    return;
  }
  sendJson(response, 200, page);
}

function handleResolve(request, response) {
  const params = readQuery(request.url);
  if (params.get("host") !== TENANT_HOST) {
    sendJson(response, 404, { code: "SITE_NOT_FOUND" });
    return;
  }
  sendJson(response, 200, RESOLVE);
}

function handleFixtureFile(pathname, response) {
  if (pathname !== "/fixtures/known-violation.html") {
    sendJson(response, 404, { code: "NOT_FOUND" });
    return;
  }
  const body = readFileSync(join(FIXTURE_DIR, "known-violation.html"), "utf8");
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

const server = createServer((request, response) => {
  const { pathname } = new URL(request.url, "http://127.0.0.1");
  if (pathname === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }
  if (pathname === "/api/v1/storefront/page") {
    handlePage(request, response);
    return;
  }
  if (pathname === "/api/v1/storefront/resolve") {
    handleResolve(request, response);
    return;
  }
  handleFixtureFile(pathname, response);
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write("release-gate fixture API listening on " + String(PORT) + "\n");
});
