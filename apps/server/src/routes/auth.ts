import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByIdentifier,
} from "@agenthub/db";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  generateJti,
} from "../utils/jwt";
import { hashPassword, comparePassword } from "../utils/password";

// ─── Types ───────────────────────────────────────────────────────────────────

type RegisterBody = {
  email: string;
  name: string;
  password: string;
};

type LoginBody = {
  email: string;
  password: string;
};

type RefreshBody = {
  refreshToken: string;
};

// ─── Validation helpers ─────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegisterInput(body: unknown): body is RegisterBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.email === "string" &&
    EMAIL_RE.test(b.email) &&
    typeof b.name === "string" &&
    b.name.length > 0 &&
    typeof b.password === "string" &&
    b.password.length >= 8
  );
}

function validateLoginInput(body: unknown): body is LoginBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.email === "string" &&
    EMAIL_RE.test(b.email) &&
    typeof b.password === "string" &&
    b.password.length > 0
  );
}

function validateRefreshInput(body: unknown): body is RefreshBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return typeof b.refreshToken === "string" && b.refreshToken.length > 0;
}

// ─── Route handlers ─────────────────────────────────────────────────────────

async function register(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = request.body;

  if (!validateRegisterInput(body)) {
    return reply.status(400).send({ error: "Invalid input" });
  }

  // Check for existing user
  const existing = await findUserByEmail(body.email);
  if (existing) {
    return reply.status(409).send({ error: "Email already registered" });
  }

  // Create user
  const passwordHash = await hashPassword(body.password);
  const user = await createUser({
    name: body.name,
    email: body.email,
    passwordHash,
  });

  // Sign tokens
  const accessToken = signAccessToken({ userId: user.id });
  const refreshToken = signRefreshToken({
    userId: user.id,
    jti: generateJti(),
  });

  return reply.status(201).send({
    user: { id: user.id, name: user.name, email: user.email },
    accessToken,
    refreshToken,
  });
}

async function login(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = request.body;

  if (!validateLoginInput(body)) {
    return reply.status(400).send({ error: "Invalid input" });
  }

  // Find user
  const user = await findUserByEmail(body.email);
  if (!user) {
    // Same response as wrong password to prevent email enumeration
    return reply.status(401).send({ error: "Invalid credentials" });
  }

  // Verify password
  const isValid = await comparePassword(body.password, user.passwordHash);
  if (!isValid) {
    return reply.status(401).send({ error: "Invalid credentials" });
  }

  // Sign tokens
  const accessToken = signAccessToken({ userId: user.id });
  const refreshToken = signRefreshToken({
    userId: user.id,
    jti: generateJti(),
  });

  return reply.status(200).send({
    user: { id: user.id, name: user.name, email: user.email },
    accessToken,
    refreshToken,
  });
}

async function refresh(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = request.body;

  if (!validateRefreshInput(body)) {
    return reply.status(400).send({ error: "Invalid input" });
  }

  // Verify refresh token
  let payload;
  try {
    payload = verifyRefreshToken(body.refreshToken);
  } catch {
    return reply.status(401).send({ error: "Invalid or expired refresh token" });
  }

  // Check user still exists
  const user = await findUserById(payload.userId);
  if (!user) {
    return reply.status(401).send({ error: "Invalid or expired refresh token" });
  }

  // Sign new access token
  const accessToken = signAccessToken({ userId: user.id });

  return reply.status(200).send({ accessToken });
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/register", register);
  app.post("/login", login);
  app.post("/refresh", refresh);
}
