import { defineConfig } from "vite-plus";

const fmtIgnorePatterns = ["**/node_modules/**", "dist/**", "out/**", "coverage/**", ".vite/**"];

/**
 * Oxfmt + Vitest + `vp staged`。Oxlint ルールは `.oxlintrc.json` に分離（`lint` をここに書くと Oxlint が誤解釈するため）。
 */
export default defineConfig({
  /** `vp staged`（pre-commit）— lint-staged 互換のグロブ → コマンド */
  staged: {
    "*.{ts,tsx,mjs,cjs,js}": ["vp lint --fix", "vp fmt"],
    "*.{json,jsonc,md,yml,yaml}": ["vp fmt"],
  },
  fmt: {
    ignorePatterns: fmtIgnorePatterns,
    printWidth: 120,
    semi: true,
    singleQuote: false,
    trailingComma: "all",
    sortPackageJson: true,
  },
  test: {
    setupFiles: ["./tests/setup.ts"],
    exclude: ["**/node_modules/**", "dist/**"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: "e2e",
          include: ["tests/e2e/**/*.test.ts"],
          environment: "node",
          pool: "forks",
          testTimeout: 30_000,
        },
      },
    ],
  },
});
