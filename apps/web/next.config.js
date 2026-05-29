import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load NEXT_PUBLIC_* vars from monorepo root .env so Next.js build can find them
try {
  const rootEnv = readFileSync(resolve(__dirname, "../../.env"), "utf8");
  for (const line of rootEnv.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key.startsWith("NEXT_PUBLIC_") && !process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // root .env may not exist in CI
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@agenthub/shared", "@agenthub/ui"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
