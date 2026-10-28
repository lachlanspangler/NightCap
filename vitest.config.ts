import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/api/test/**/*.test.ts", "scripts/test/**/*.test.ts"],
    pool: "forks",
    poolOptions: { forks: { maxForks: 4 } },
    testTimeout: 20_000,
  },
});
