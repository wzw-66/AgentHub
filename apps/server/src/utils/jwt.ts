import jwt from "jsonwebtoken";
import { config } from "../config/env";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AccessTokenPayload = {
  userId: string;
};

export type RefreshTokenPayload = {
  userId: string;
  jti: string;
};

// ─── Sign ────────────────────────────────────────────────────────────────────

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiresIn,
  });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
}

// ─── Verify ──────────────────────────────────────────────────────────────────

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, config.jwt.secret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, config.jwt.secret) as RefreshTokenPayload;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function generateJti(): string {
  return crypto.randomUUID();
}
