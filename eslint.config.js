import svelte from "eslint-plugin-svelte";
import globals from "globals";
export default [
  ...svelte.configs["flat/recommended"],
  { ignores: ["dist/**"] },
  {
    files: ["**/*.{js,mjs,svelte}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "svelte/no-at-html-tags": "off",
    },
  },
];
