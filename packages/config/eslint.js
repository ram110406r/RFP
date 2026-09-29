import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Shared base ESLint flat config for every app/package in the monorepo.
 * Apps layer framework-specific rules (react-hooks, NestJS, etc.) on top.
 */
export const baseConfig = tseslint.config(
  { ignores: ["dist", "build", ".next", ".turbo", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);

export const nodeConfig = [
  ...baseConfig,
  {
    languageOptions: {
      globals: globals.node,
    },
  },
];
