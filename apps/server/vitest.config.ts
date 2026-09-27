import { defineConfig } from "vitest/config";
import path from "node:path";
import dotenv from "dotenv";

// 以仓库根 .env 为唯一配置来源 —— vitest 不会自动加载它
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const TEST_DATABASE_URL =
  process.env["TEST_DATABASE_URL"] || "file:./test.db";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts", "src/orchestrator/__tests__/**/*.test.ts"],
    setupFiles: ["src/__tests__/setup.ts"],
    testTimeout: 15000,
    hookTimeout: 30000,
    // 这行在迁移到 SQLite 之前就存在，非本次改动引入。
    // 实测并行也能全绿（1.49s vs 串行 4.24s），所以「SQLite 争锁」不是它的理由；
    // 多个测试文件会对同一批表做 deleteMany（如 name startsWith "Ag-"），
    // 并行时存在互相干扰的理论风险，但未复现。想提速可先移除本行多跑几次观察。
    fileParallelism: false,
    env: {
      // Override DATABASE_URL so the server's prisma singleton uses test DB
      DATABASE_URL: TEST_DATABASE_URL,
      TEST_DATABASE_URL,
    },
  },
});
