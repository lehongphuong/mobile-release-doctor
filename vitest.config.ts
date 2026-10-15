import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/core/tests/**/*.test.ts"],
    testTimeout: 20000,
  },
});
