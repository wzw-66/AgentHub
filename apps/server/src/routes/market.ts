import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  getPublishedAgent,
  listPublishedAgents,
  createPublishedAgent,
  updatePublishedAgent,
  deletePublishedAgent,
  incrementImportCount,
  listMyPublishedAgents,
  findPublishedByContactId,
  getContact,
  createContact as dbCreateContact,
} from "@agenthub/db";
import type { AgentProvider } from "@agenthub/shared";

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Types ───────────────────────────────────────────────────────────────────

type MarketParams = {
  id: string;
};

type ListMarketQuery = {
  q?: string;
  provider?: AgentProvider;
  tag?: string;
};

type PublishBody = {
  contactId: string;
  description?: string;
  tags?: string[];
};

type UpdateMarketBody = {
  description?: string;
  tags?: string[];
};

// ─── Validation ──────────────────────────────────────────────────────────────

function validatePublishBody(body: unknown): body is PublishBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return typeof b.contactId === "string" && b.contactId.length > 0;
}

// ─── Route handlers ─────────────────────────────────────────────────────────

async function handleList(
  request: FastifyRequest<{ Querystring: ListMarketQuery }>,
  reply: FastifyReply
): Promise<void> {
  const agents = await listPublishedAgents({
    q: request.query.q,
    provider: request.query.provider,
    tag: request.query.tag,
  });
  return reply.status(200).send(agents);
}

async function handleDetail(
  request: FastifyRequest<{ Params: MarketParams }>,
  reply: FastifyReply
): Promise<void> {
  const agent = await getPublishedAgent(request.params.id);
  if (!agent) {
    return reply.status(404).send({ error: "Published agent not found" });
  }
  return reply.status(200).send(agent);
}

async function handlePublish(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!validatePublishBody(request.body)) {
    return reply.status(400).send({ error: "Invalid input" });
  }

  const { contactId, description, tags } = request.body as PublishBody;
  const userId = request.userId!;

  // Verify the contact exists and belongs to this user
  const contact = await getContact(contactId);
  if (!contact) {
    return reply.status(404).send({ error: "Contact not found" });
  }
  if (contact.userId !== userId) {
    return reply.status(403).send({ error: "Forbidden" });
  }

  // Create a snapshot of the contact as a published agent
  const published = await createPublishedAgent({
    name: contact.name,
    description: description ?? null,
    avatarUrl: contact.avatarUrl,
    provider: contact.provider,
    systemPrompt: contact.systemPrompt,
    model: contact.model,
    config: contact.config as any,
    tags: tags ?? [],
    creatorId: userId,
    sourceContactId: contactId,
  });

  return reply.status(201).send(published);
}

async function handleImport(
  request: FastifyRequest<{ Params: MarketParams }>,
  reply: FastifyReply
): Promise<void> {
  const userId = request.userId!;
  const publishedId = request.params.id;

  const published = await getPublishedAgent(publishedId);
  if (!published) {
    return reply.status(404).send({ error: "Published agent not found" });
  }

  // Clone the published agent config as a new contact for the importing user
  const contact = await dbCreateContact({
    userId,
    name: published.name,
    avatarUrl: published.avatarUrl,
    provider: published.provider,
    systemPrompt: published.systemPrompt,
    model: published.model,
    config: published.config as any,
    displayName: published.name,
    tags: [],
    isPinned: false,
  });

  // Increment import count (for popularity tracking)
  await incrementImportCount(publishedId);

  return reply.status(201).send(contact);
}

async function handleUpdate(
  request: FastifyRequest<{ Params: MarketParams }>,
  reply: FastifyReply
): Promise<void> {
  const existing = await getPublishedAgent(request.params.id);
  if (!existing) {
    return reply.status(404).send({ error: "Published agent not found" });
  }
  if (existing.creatorId !== request.userId) {
    return reply.status(403).send({ error: "Forbidden" });
  }

  const body = request.body as UpdateMarketBody;
  const updated = await updatePublishedAgent(request.params.id, {
    description: body.description,
    tags: body.tags,
  });

  return reply.status(200).send(updated);
}

async function handleUnpublish(
  request: FastifyRequest<{ Params: MarketParams }>,
  reply: FastifyReply
): Promise<void> {
  const existing = await getPublishedAgent(request.params.id);
  if (!existing) {
    return reply.status(404).send({ error: "Published agent not found" });
  }
  if (existing.creatorId !== request.userId) {
    return reply.status(403).send({ error: "Forbidden" });
  }

  await deletePublishedAgent(request.params.id);
  return reply.status(204).send();
}

async function handleFindByContact(
  request: FastifyRequest<{ Params: { contactId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const agent = await findPublishedByContactId(request.params.contactId);
  return reply.status(200).send(agent);
}

async function handleMyListings(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const agents = await listMyPublishedAgents(request.userId!);
  return reply.status(200).send(agents);
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export async function marketRoutes(app: FastifyInstance): Promise<void> {
  app.get("/list", handleList);
  app.get("/find-by-contact/:contactId", handleFindByContact);
  app.get("/my-listings", handleMyListings);
  app.get("/:id/detail", handleDetail);
  app.post("/publish", handlePublish);
  app.post("/:id/import", handleImport);
  app.patch("/:id/update", handleUpdate);
  app.delete("/:id/unpublish", handleUnpublish);
}
