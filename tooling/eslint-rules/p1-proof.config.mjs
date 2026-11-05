import { parser } from "typescript-eslint";
import { P1_SELECTORS } from "./selectors.mjs";

/**
 * Isolated proof for the P1 detector. It deliberately excludes the repository
 * suppressions so the original flag-status code fails visibly.
 */
export default [
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser,
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "no-restricted-syntax": ["error", ...P1_SELECTORS],
    },
  },
];
