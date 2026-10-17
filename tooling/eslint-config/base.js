/** @type {import("eslint").Linter.Config} */
module.exports = {
  env: {
    node: true,
    es2022: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" },
    ],
    "@typescript-eslint/ban-ts-comment": "error",
    "no-empty": ["error", { "allowEmptyCatch": false }],
  },
  ignorePatterns: [
    "node_modules/",
    "dist/",
    ".turbo/",
    ".next/",
    "coverage/",
  ],
};
