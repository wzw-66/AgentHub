import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";

export const TEST_DATABASE_URL =
  process.env["TEST_DATABASE_URL"] ||
  "postgresql://agenthub:agenthub_dev@localhost:5432/agenthub_test";

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
