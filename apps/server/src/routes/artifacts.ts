import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getArtifact } from "@agenthub/db";

// ─── Types ───────────────────────────────────────────────────────────────────

type ArtifactParams = {
  id: string;
};

// ─── Route handlers ─────────────────────────────────────────────────────────

async function handleDetail(
  request: FastifyRequest<{ Params: ArtifactParams }>,
  reply: FastifyReply
): Promise<void> {
  const artifact = await getArtifact(request.params.id);

  if (!artifact) {
    return reply.status(404).send({ error: "Artifact not found" });
  }

  return reply.status(200).send(artifact);
}

async function handlePreview(
  request: FastifyRequest<{ Params: ArtifactParams }>,
  reply: FastifyReply
): Promise<void> {
  const artifact = await getArtifact(request.params.id);

  if (!artifact) {
    return reply.status(404).send({ error: "Artifact not found" });
  }

  return reply.status(200).send({
    id: artifact.id,
    previewUrl: artifact.previewUrl,
    content: artifact.content,
    type: artifact.type,
  });
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export async function artifactRoutes(app: FastifyInstance): Promise<void> {
  app.get("/:id/detail", handleDetail);
  app.get("/:id/preview", handlePreview);
}
