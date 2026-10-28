import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/coverage/**",
      ".data/**",
      ".run/**",
      "apps/mobile/**",
      "**/*.config.js",
      "docs/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        Response: "readonly",
        Request: "readonly",
        FormData: "readonly",
        Blob: "readonly",
        File: "readonly",
        TextEncoder: "readonly",
        crypto: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // Tests read loosely-typed JSON bodies.
    files: ["**/test/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    // Core is pure: no system clock, no randomness, no I/O. Time and randomness are injected.
    files: ["packages/core/src/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "core is pure: take `now` as an argument (injected Clock).",
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: "core is pure: take `now` as an argument (injected Clock).",
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: "core is pure: inject a random source.",
        },
      ],
      "no-restricted-imports": ["error", { patterns: ["node:*", "fs", "path", "crypto", "http", "https"] }],
    },
  },
);
