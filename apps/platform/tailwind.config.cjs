/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("../../packages/ui/tailwind.preset.cjs")],
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};
