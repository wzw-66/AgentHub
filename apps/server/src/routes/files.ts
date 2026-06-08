import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { fileService } from "../services/file-service.js";

// ─── Types ───────────────────────────────────────────────────────────────────

type ConvIdParams = {
  conversationId: string;
};

type FilePathBody = {
  path: string;
  content?: string;
};

type ReadFileBody = {
  path: string;
};

type DeleteFileBody = {
  path: string;
};

// ─── Route handlers ─────────────────────────────────────────────────────────

/**
 * GET /api/files/:conversationId/list
 * List all files in the conversation workspace.
 * Optional query: ?path=sub/dir to list a subdirectory
 */
async function handleList(
  request: FastifyRequest<{
    Params: ConvIdParams;
    Querystring: { path?: string };
  }>,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { conversationId } = request.params;
    const subPath = request.query.path;

    const files = await fileService.listFiles(conversationId, subPath);
    return reply.status(200).send({ data: files });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list files";
    if (message.includes("not found")) {
      return reply.status(404).send({ error: message });
    }
    return reply.status(500).send({ error: message });
  }
}

/**
 * POST /api/files/:conversationId/read
 * Read a file's content from the workspace.
 * Body: { path: "src/index.html" }
 */
async function handleRead(
  request: FastifyRequest<{
    Params: ConvIdParams;
    Body: ReadFileBody;
  }>,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { conversationId } = request.params;
    const { path } = request.body;

    if (!path || typeof path !== "string") {
      return reply.status(400).send({ error: "path is required" });
    }

    const content = await fileService.readFile(conversationId, path);
    const isText = fileService.isTextFile(path);

    return reply.status(200).send({
      ...content,
      isText,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read file";
    if (message.includes("not found") || message.includes("No such") || message.includes("ENOENT")) {
      return reply.status(404).send({ error: "File not found" });
    }
    if (message.includes("too large")) {
      return reply.status(413).send({ error: message });
    }
    return reply.status(500).send({ error: message });
  }
}

/**
 * POST /api/files/:conversationId/save
 * Save content to a file in the workspace.
 * Body: { path: "src/index.html", content: "<html>...</html>" }
 */
async function handleSave(
  request: FastifyRequest<{
    Params: ConvIdParams;
    Body: FilePathBody;
  }>,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { conversationId } = request.params;
    const { path, content } = request.body;

    if (!path || typeof path !== "string") {
      return reply.status(400).send({ error: "path is required" });
    }
    if (content === undefined || content === null) {
      return reply.status(400).send({ error: "content is required" });
    }

    const result = await fileService.saveFile(conversationId, path, String(content));
    return reply.status(200).send(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save file";
    if (message.includes("traversal")) {
      return reply.status(400).send({ error: message });
    }
    return reply.status(500).send({ error: message });
  }
}

/**
 * POST /api/files/:conversationId/delete
 * Delete a file or directory from the workspace.
 * Body: { path: "src/index.html" }
 */
async function handleDelete(
  request: FastifyRequest<{
    Params: ConvIdParams;
    Body: DeleteFileBody;
  }>,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { conversationId } = request.params;
    const { path } = request.body;

    if (!path || typeof path !== "string") {
      return reply.status(400).send({ error: "path is required" });
    }

    await fileService.deleteFile(conversationId, path);
    return reply.status(200).send({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete file";
    if (message.includes("not found") || message.includes("ENOENT")) {
      return reply.status(404).send({ error: "File not found" });
    }
    return reply.status(500).send({ error: message });
  }
}

// ─── Plugin ─────────────────────────────────────────────────────────────────

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  app.get("/:conversationId/list", handleList);
  app.post("/:conversationId/read", handleRead);
  app.post("/:conversationId/save", handleSave);
  app.post("/:conversationId/delete", handleDelete);
}
