import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  globalIgnores([
    "node_modules/**",
    "main.js",
    "dist/**",
    "test-results/**",
    "playwright-report/**",
    "esbuild.config.mjs",
    "eslint.config.mjs",
    "playwright.config.ts",
    "scripts/**",
    "tests/**",
    "**/*.test.ts",
  ]),
  ...obsidianmd.configs.recommended,
  { languageOptions: { parserOptions: { projectService: true } } },
]);
