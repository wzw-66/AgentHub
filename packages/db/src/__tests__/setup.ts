import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import path from "node:path";
import dotenv from "dotenv";

// 以仓库根 .env 为唯一配置来源。vitest 不会自动加载它，而 Prisma CLI 也只读
// (cwd)/.env 与 (schema 目录)/.env —— 见 packages/db/scripts/with-env.mjs
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

export const TEST_DATABASE_URL =
  process.env["TEST_DATABASE_URL"] || "file:./test.db";

// Push schema once before all tests
beforeAll(() => {
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    cwd: __dirname + "/../..",
    stdio: "pipe",
  });
});

// Create a fresh PrismaClient connected to test database
export function createTestClient(): PrismaClient {
  return new PrismaClient({
    datasourceUrl: TEST_DATABASE_URL,
  });
}
