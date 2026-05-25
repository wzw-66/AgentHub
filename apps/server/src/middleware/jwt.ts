import type {
  FastifyRequest,
  FastifyReply,
  HookHandlerDoneFunction,
} from "fastify";
import { verifyAccessToken } from "../utils/jwt";

// ─── Fastify decorator augmentation ─────────────────────────────────────────

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

// ─── Auth header middleware ─────────────────────────────────────────────────

export function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    _reply.status(401).send({ error: "missing_token" });
    return; // don't call done()
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    _reply.status(401).send({ error: "invalid_token" });
    return;
  }

  const token = parts[1];

  try {
    const payload = verifyAccessToken(token);
    request.userId = payload.userId;
    done();
  } catch (err: unknown) {
    const message =
      err instanceof Error && err.name === "TokenExpiredError"
        ? "token_expired"
        : "invalid_token";
    _reply.status(401).send({ error: message });
  }
}

// ─── SSE/WS query token validation ─────────────────────────────────────────

export function verifyQueryToken(
  query: { token?: string }
): { userId: string } | null {
  if (!query.token) return null;

  try {
    const payload = verifyAccessToken(query.token);
    return { userId: payload.userId };
  } catch {
    return null;
  }
}
