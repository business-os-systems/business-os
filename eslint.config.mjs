import js from "@eslint/js";
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";
import importPlugin from "eslint-plugin-import";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import security from "eslint-plugin-security";
import globals from "globals";
import {
  DANGEROUS_HTML_SELECTOR,
  PAGE_LEVEL_TABLIST_SELECTOR,
  P1_SELECTORS,
  PROCESS_ENV_SELECTOR,
  RESTRICTED_CACHE_IMPORTS,
  RESTRICTED_ORM_IMPORTS,
  RESTRICTED_UI_IMPORTS,
} from "./tooling/eslint-rules/selectors.mjs";

/**
 * One lint configuration for the whole monorepo.
 *
 * Type-aware rules run through the TypeScript project service, so a file is
 * checked against its own package tsconfig. Legacy violations are recorded in
 * eslint-suppressions.json; only new violations fail the build.
 */

const TS_FILES = ["**/*.ts", "**/*.tsx"];
const TYPED_FILES = [
  "apps/*/src/**/*.{ts,tsx}",
  "apps/*/tests/**/*.{ts,tsx}",
  "packages/*/src/**/*.{ts,tsx}",
  "packages/{core,flags,auth,db,logger,redis}/tests/**/*.{ts,tsx}",
  "packages/modules/*/src/**/*.{ts,tsx}",
  "packages/modules/*/tests/**/*.{ts,tsx}",
];

const CONFIG_FILE_PATTERNS = [
  "**/env.ts",
  "**/env/**/*.ts",
  "**/*-env.ts",
  "**/*.env.ts",
  "**/config/**/*.ts",
  "**/*.config.{ts,mjs,cjs,js}",
  "**/instrumentation*.ts",
  "**/sentry.*.config.ts",
  "**/scripts/**/*.ts",
  "**/tests/**/*.{ts,tsx}",
  "**/test/**/*.{ts,tsx}",
  "**/*.test.{ts,tsx}",
  "**/*.spec.{ts,tsx}",
];

const DOMAIN_PACKAGES = [
  "packages/core/src/**/*.{ts,tsx}",
  "packages/flags/src/**/*.{ts,tsx}",
  "packages/auth/src/**/*.{ts,tsx}",
  "packages/db/src/**/*.{ts,tsx}",
  "packages/redis/src/**/*.{ts,tsx}",
  "packages/logger/src/**/*.{ts,tsx}",
];

const PRESENTATION_FOLDERS = [
  "apps/api/src/routes/**/*.{ts,tsx}",
  "apps/dashboard/src/**/*.{ts,tsx}",
  "apps/platform/src/**/*.{ts,tsx}",
];

// P2 keeps the ORM out of transport and presentation code; a service layer is
// the one place allowed to own the query (§5.4 P2, tooling/quality/code-quality-rules.md).
const DASHBOARD_DATA_ACCESS_FOLDERS = ["apps/dashboard/src/services/**/*.{ts,tsx}"];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/graphify-out/**",
      "**/.agents/**",
      "**/.pnpm-store/**",
      "specs/**",
      "packages/db/prisma/schema/migrations/**",
      "tooling/eslint-rules/fixtures/**",
      "**/*.d.ts",
    ],
  },
  {
    files: TS_FILES,
    languageOptions: {
      parser: tseslint.parser,
      globals: { ...globals.node, ...globals.es2022 },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      sonarjs,
      import: importPlugin,
      security,
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: [
            "apps/*/tsconfig.json",
            "packages/*/tsconfig.json",
            "packages/modules/*/tsconfig.json",
          ],
        },
        node: true,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      "no-else-return": "error",
      "no-nested-ternary": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-param-reassign": ["error", { props: true }],
      "prefer-const": "error",
      "no-var": "error",
      "no-empty": ["error", { allowEmptyCatch: false }],
      "max-depth": ["error", 3],
      "max-params": ["error", 4],
      complexity: ["error", 10],
      "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }],
      "no-warning-comments": ["warn", { terms: ["todo", "fixme"], location: "start" }],
      "security/detect-eval-with-expression": "error",
      "security/detect-unsafe-regex": "error",
      "security/detect-non-literal-regexp": "error",
      "security/detect-child-process": "error",
      "security/detect-bidi-characters": "error",
    },
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: TYPED_FILES,
    languageOptions: {
      ...config.languageOptions,
      parserOptions: {
        ...config.languageOptions?.parserOptions,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  })),
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({
    ...config,
    files: TYPED_FILES,
  })),
  {
    files: TYPED_FILES,
    rules: {
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        {
          considerDefaultExhaustiveForUnions: false,
          requireDefaultForNonUnion: true,
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
          "ts-ignore": "allow-with-description",
          "ts-nocheck": true,
          "ts-check": false,
          minimumDescriptionLength: 10,
        },
      ],
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/prefer-promise-reject-errors": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/require-await": "error",
      "no-await-in-loop": "warn",
      "sonarjs/cognitive-complexity": ["error", 15],
      "sonarjs/no-duplicate-string": ["error", { threshold: 4 }],
      "sonarjs/no-identical-functions": "error",
      "sonarjs/no-collapsible-if": "error",
      "sonarjs/no-small-switch": "error",
      "import/no-cycle": ["error", { maxDepth: 10, ignoreExternal: true }],
    },
  },
  {
    files: TS_FILES,
    rules: {
      "no-restricted-syntax": ["error", ...P1_SELECTORS, PROCESS_ENV_SELECTOR],
    },
  },
  {
    files: CONFIG_FILE_PATTERNS,
    rules: {
      "no-restricted-syntax": ["error", ...P1_SELECTORS],
    },
  },
  {
    files: PRESENTATION_FOLDERS,
    ignores: DASHBOARD_DATA_ACCESS_FOLDERS,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [RESTRICTED_ORM_IMPORTS, RESTRICTED_CACHE_IMPORTS],
        },
      ],
    },
  },
  {
    files: DOMAIN_PACKAGES,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [RESTRICTED_UI_IMPORTS],
        },
      ],
    },
  },
  {
    files: ["packages/*/src/**/*.{ts,tsx}", "packages/modules/*/src/**/*.{ts,tsx}"],
    rules: {
      "import/no-default-export": "error",
    },
  },
  {
    files: [
      "apps/dashboard/src/**/*.{ts,tsx}",
      "apps/platform/src/**/*.{ts,tsx}",
      "packages/ui/src/**/*.{ts,tsx}",
    ],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "react/no-array-index-key": "error",
      "react/jsx-no-leaked-render": "error",
      "react/no-unstable-nested-components": "error",
      "no-restricted-syntax": [
        "error",
        ...P1_SELECTORS,
        PROCESS_ENV_SELECTOR,
        DANGEROUS_HTML_SELECTOR,
      ],
    },
  },
  {
    // Hub Navigation Law ratchet: App Router route files are page-level
    // surfaces. A tablist there is a second navigation system; H-2 tabs belong
    // inside a panel component, never in a page or layout.
    files: ["apps/*/src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...P1_SELECTORS,
        PROCESS_ENV_SELECTOR,
        DANGEROUS_HTML_SELECTOR,
        PAGE_LEVEL_TABLIST_SELECTOR,
      ],
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/tests/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...P1_SELECTORS],
    },
  },
  {
    // apps/platform's validated environment boundary (mirrors apps/api/src/lib/env.ts).
    files: ["apps/platform/src/lib/env.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...P1_SELECTORS],
    },
  },
);
