#!/usr/bin/env node
/**
 * 环境变量包装器：加载仓库根的 .env，再执行给定命令。
 *
 * 为什么需要它：Prisma CLI 只从 `(cwd)/.env` 和 `(schema 目录)/.env` 读取环境变量，
 * 不会向上查找仓库根的 .env；由 tsx 运行的 seed 脚本同理（PrismaClient 需要
 * DATABASE_URL）。本仓库以根 .env 为唯一配置来源，故在此显式加载，避免出现
 * 「根 .env 供 server 读、包内 .env 供 CLI 读」两份配置互相漂移。
 *
 * 用法：
 *   node scripts/with-env.mjs prisma db push
 *   node scripts/with-env.mjs --test prisma db push   # DATABASE_URL ← TEST_DATABASE_URL
 *   node scripts/with-env.mjs tsx src/seed.ts
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "../..");
const envFile = path.join(repoRoot, ".env");

const argv = process.argv.slice(2);
const useTestDatabase = argv[0] === "--test";
const [command, ...commandArgs] = useTestDatabase ? argv.slice(1) : argv;

if (!command) {
  console.error("用法: node scripts/with-env.mjs [--test] <command> [args...]");
  process.exit(1);
}

// 不覆盖已存在的环境变量 —— CI 里可直接注入而无需 .env
dotenv.config({ path: envFile });

if (useTestDatabase) {
  const testUrl = process.env["TEST_DATABASE_URL"];
  if (!testUrl) {
    console.error(`❌ --test 需要 TEST_DATABASE_URL，但 ${envFile} 里没有。`);
    process.exit(1);
  }
  process.env["DATABASE_URL"] = testUrl;
}

if (!process.env["DATABASE_URL"]) {
  console.error(`❌ 未找到 DATABASE_URL。请检查 ${envFile}`);
  process.exit(1);
}

// 优先解析本包的 node_modules/.bin —— pnpm 跑脚本时会注入 PATH，但直接执行
// `node scripts/with-env.mjs ...` 时不会，此时按名 spawn 会 ENOENT。
const localBin = path.join(packageRoot, "node_modules", ".bin", command);
const executable = existsSync(localBin) ? localBin : command;

const result = spawnSync(executable, commandArgs, {
  cwd: packageRoot,
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(`❌ 执行 ${command} 失败: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
