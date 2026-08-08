import { defineConfig, globalIgnores } from "eslint/config";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

const baseDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig([
  globalIgnores(["dist/**", "node_modules/**", "coverage/**", "eslint.config.mjs"]),
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: baseDirectory,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "warn",
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    rules: {
      "no-console": "warn",
      "no-unused-vars": "warn",
    },
  },
]);
