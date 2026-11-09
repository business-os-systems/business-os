import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RuleTester } from "eslint";
import { builtinRules } from "eslint/use-at-your-own-risk";
import { parser as tsParser } from "typescript-eslint";
import {
  DANGEROUS_HTML_SELECTOR,
  PAGE_LEVEL_TABLIST_SELECTOR,
  P1_SELECTORS,
  PROCESS_ENV_SELECTOR,
  RESTRICTED_ORM_IMPORTS,
} from "./selectors.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const noRestrictedSyntax = builtinRules.get("no-restricted-syntax");
const noRestrictedImports = builtinRules.get("no-restricted-imports");

assert.ok(noRestrictedSyntax, "no-restricted-syntax must exist");
assert.ok(noRestrictedImports, "no-restricted-imports must exist");

const tsRuleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

tsRuleTester.run("P1: if/else presentation props", noRestrictedSyntax, {
  valid: [
    {
      name: "derived state then a map lookup",
      code: `
        const FLAG_LABELS = {
          expired: { label: "Expired", className: "text-danger" },
          active: { label: "Active", className: "text-success" },
        };
        function stateText(flag) {
          const state = flag.expired ? "expired" : "active";
          return FLAG_LABELS[state];
        }
      `,
      options: [...P1_SELECTORS],
    },
    {
      name: "a non-presentation object returned from a branch",
      code: `function count(flag) { if (flag) return { total: 1 }; return { total: 0 }; }`,
      options: [...P1_SELECTORS],
    },
  ],
  invalid: [
    {
      name: "UI props returned from an if/else",
      code: `
        function stateText(flag) {
          if (flag.expired) return { label: "Expired", className: "text-danger" };
          else return { label: "Active", className: "text-success" };
        }
      `,
      options: [...P1_SELECTORS],
      errors: 2,
    },
  ],
});

tsRuleTester.run("P1: switch presentation props", noRestrictedSyntax, {
  valid: [
    {
      name: "switch returns a domain state",
      code: `
        function stateText(kind) {
          switch (kind) {
            case "expired": return "expired";
            default: return "active";
          }
        }
      `,
      options: [...P1_SELECTORS],
    },
  ],
  invalid: [
    {
      name: "UI props returned from switch cases",
      code: `
        function stateText(kind) {
          switch (kind) {
            case "expired": return { color: "danger" };
            default: return { color: "success" };
          }
        }
      `,
      options: [...P1_SELECTORS],
      errors: 2,
    },
  ],
});

tsRuleTester.run("P1: inline as const on a conditional return", noRestrictedSyntax, {
  valid: [
    {
      name: "one declaration for the whole map",
      code: `const COUNTS = { one: 1 } as const; function count(flag) { if (flag) return COUNTS.one; return 0; }`,
      options: [...P1_SELECTORS],
    },
  ],
  invalid: [
    {
      name: "as const applied to a branch return",
      code: `function count(flag) { if (flag) return { total: 1 } as const; return { total: 0 }; }`,
      options: [...P1_SELECTORS],
      errors: 1,
    },
  ],
});

tsRuleTester.run("P14: process.env outside the config module", noRestrictedSyntax, {
  valid: [
    {
      name: "validated config object",
      code: `const databaseUrl = config.databaseUrl;`,
      options: [PROCESS_ENV_SELECTOR],
    },
  ],
  invalid: [
    {
      name: "direct environment read",
      code: `const databaseUrl = process.env.DATABASE_URL;`,
      options: [PROCESS_ENV_SELECTOR],
      errors: 1,
    },
  ],
});

tsRuleTester.run("P2: ORM import in a route", noRestrictedImports, {
  valid: [
    {
      name: "route imports a service",
      code: `import { findTenant } from "../services/tenant.js";`,
      options: [{ patterns: [RESTRICTED_ORM_IMPORTS] }],
    },
  ],
  invalid: [
    {
      name: "route imports the database client",
      code: `import { db } from "@suite/db";`,
      options: [{ patterns: [RESTRICTED_ORM_IMPORTS] }],
      errors: 1,
    },
  ],
});

const jsxRuleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

jsxRuleTester.run("P17: raw HTML injection", noRestrictedSyntax, {
  valid: [
    {
      name: "structured content",
      code: `const view = <div>{text}</div>;`,
      options: [DANGEROUS_HTML_SELECTOR],
    },
  ],
  invalid: [
    {
      name: "dangerouslySetInnerHTML",
      code: `const view = <div dangerouslySetInnerHTML={{ __html: html }} />;`,
      options: [DANGEROUS_HTML_SELECTOR],
      errors: 1,
    },
  ],
});

jsxRuleTester.run("Hub law: page-level tablist", noRestrictedSyntax, {
  valid: [
    {
      name: "an in-panel tabpanel is not a page-level tablist",
      code: `const view = <div role="tabpanel">{text}</div>;`,
      options: [PAGE_LEVEL_TABLIST_SELECTOR],
    },
  ],
  invalid: [
    {
      name: "a page-level tablist is a second navigation system",
      code: `const view = <div role="tablist"><button role="tab">Overview</button></div>;`,
      options: [PAGE_LEVEL_TABLIST_SELECTOR],
      errors: 1,
    },
  ],
});
