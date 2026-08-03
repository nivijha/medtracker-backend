import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 180000,
  },
});
