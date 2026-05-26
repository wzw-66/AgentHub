import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  listCredentials,
  getCredential,
  createCredential as dbCreateCredential,
  deleteCredential as dbDeleteCredential,
} from "@agenthub/db";

// ─── Types ───────────────────────────────────────────────────────────────────

type CreateCredentialBody = {
  provider: string;
  encryptedKey: string;
};

type CredentialParams = {
  id: string;
};

// ─── Validation helpers ─────────────────────────────────────────────────────

function validateCreateCredential(body: unknown): body is CreateCredentialBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.provider === "string" &&
    b.provider.length > 0 &&
    typeof b.encryptedKey === "string" &&
    b.encryptedKey.length > 0
  );
}

// ─── Route handlers ─────────────────────────────────────────────────────────

async function handleList(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const credentials = await listCredentials(request.userId!);

  // Mask encryptedKey for security
  const masked = credentials.map((c) => ({
    ...c,
    encryptedKey: "****",
  }));

  return reply.status(200).send(masked);
}

async function handleCreate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!validateCreateCredential(request.body)) {
    return reply.status(400).send({ error: "Invalid input" });
  }

  const body = request.body as CreateCredentialBody;
  const credential = await dbCreateCredential({
    userId: request.userId!,
    provider: body.provider,
    encryptedKey: body.encryptedKey,
  });

  return reply.status(201).send(credential);
}

async function handleDelete(
  request: FastifyRequest<{ Params: CredentialParams }>,
  reply: FastifyReply
): Promise<void> {
  const existing = await getCredential(request.params.id);

  if (!existing) {
    return reply.status(404).send({ error: "Credential not found" });
  }

  if (existing.userId !== request.userId) {
    return reply.status(403).send({ error: "Forbidden" });
  }

  await dbDeleteCredential(request.params.id);
  return reply.status(204).send();
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export async function credentialRoutes(app: FastifyInstance): Promise<void> {
  app.get("/list", handleList);
  app.post("/create", handleCreate);
  app.delete("/:id/delete", handleDelete);
}
