/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["@suite/eslint-config"],
  parserOptions: {
    tsconfigRootDir: __dirname,
  },
};
