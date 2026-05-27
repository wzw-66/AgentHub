import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL =
  process.env["TEST_DATABASE_URL"] ||
  "postgresql://agenthub:agenthub_dev@localhost:5432/agenthub_test";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts", "src/orchestrator/__tests__/**/*.test.ts"],
    setupFiles: ["src/__tests__/setup.ts"],
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false,
    env: {
      // Override DATABASE_URL so the server's prisma singleton uses test DB
      DATABASE_URL: TEST_DATABASE_URL,
    },
  },
});
