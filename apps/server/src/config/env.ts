import { env } from "node:process";

export const config = {
  port: parseInt(env["PORT"] || "3001", 10),
  host: env["HOST"] || "0.0.0.0",

  jwt: {
    secret: env["JWT_SECRET"] || "dev-secret-do-not-use-in-production",
    accessExpiresIn: env["JWT_ACCESS_EXPIRES_IN"] || "15m",
    refreshExpiresIn: env["JWT_REFRESH_EXPIRES_IN"] || "7d",
  },
} as const;
