import { createAdapter } from "./packages/agent-core/dist/index.js";
import { ChunkType } from "./packages/shared/dist/index.js";

const adapter = createAdapter("OpenCode", {
  model: "anthropic/claude-sonnet-4-6",
});

const context = {
  conversationId: "test",
  message: "Say exactly: hello from opencode adapter",
  history: [],
  agents: [],
};

console.log("Starting execution...");
const chunks = [];
try {
  for await (const chunk of adapter.execute(context)) {
    chunks.push(chunk);
    console.log("CHUNK:", chunk.type, (chunk.content || "").substring(0, 100));
    if (chunk.type === ChunkType.Done) break;
  }
  console.log("\nTotal chunks:", chunks.length);
  const text = chunks
    .filter((c) => c.type === ChunkType.Text)
    .map((c) => c.content)
    .join("");
  console.log("Full response:", text);
} catch (err) {
  console.error("ERROR:", err.message);
  console.error(err.stack);
}
