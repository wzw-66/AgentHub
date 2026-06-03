import type { Chunk } from "@agenthub/shared";
import { ChunkType } from "@agenthub/shared";

// ─── Types ─────────────────────────────────────────────────────────────

export type ArtifactType = "web_preview" | "code" | "diff" | "document";

export type ArtifactDetectionResult = {
  type: ArtifactType;
  language: string;
  title: string;
  content: string;
};

// ─── Extension → artifact type map ─────────────────────────────────────

const EXTENSION_MAP: Record<string, { type: ArtifactType; language: string }> = {
  ".html":  { type: "web_preview", language: "html" },
  ".htm":   { type: "web_preview", language: "html" },
  ".xhtml": { type: "web_preview", language: "html" },
  ".svg":   { type: "web_preview", language: "svg" },
  ".java":  { type: "code", language: "java" },
  ".c":     { type: "code", language: "c" },
  ".cpp":   { type: "code", language: "cpp" },
  ".cc":    { type: "code", language: "cpp" },
  ".cxx":   { type: "code", language: "cpp" },
  ".h":     { type: "code", language: "c" },
  ".hpp":   { type: "code", language: "cpp" },
  ".json":  { type: "code", language: "json" },
  ".py":    { type: "code", language: "python" },
  ".js":    { type: "code", language: "javascript" },
  ".ts":    { type: "code", language: "typescript" },
  ".tsx":   { type: "code", language: "typescript" },
  ".jsx":   { type: "code", language: "javascript" },
  ".css":   { type: "code", language: "css" },
  ".scss":  { type: "code", language: "scss" },
  ".go":    { type: "code", language: "go" },
  ".rs":    { type: "code", language: "rust" },
  ".rb":    { type: "code", language: "ruby" },
  ".php":   { type: "code", language: "php" },
  ".swift": { type: "code", language: "swift" },
  ".kt":    { type: "code", language: "kotlin" },
  ".sql":   { type: "code", language: "sql" },
  ".yaml":  { type: "code", language: "yaml" },
  ".yml":   { type: "code", language: "yaml" },
  ".toml":  { type: "code", language: "toml" },
  ".xml":   { type: "code", language: "xml" },
  ".vue":   { type: "code", language: "vue" },
  ".sh":    { type: "code", language: "bash" },
  ".bash":  { type: "code", language: "bash" },
  ".md":    { type: "document", language: "markdown" },
  ".diff":  { type: "diff", language: "diff" },
  ".patch": { type: "diff", language: "diff" },
};

// ─── Content sniffing patterns ─────────────────────────────────────────

function sniffFromContent(text: string): { type: ArtifactType; language: string } | null {
  const t = text.trim();

  // Web preview (HTML/SVG)
  if (
    t.startsWith("<!DOCTYPE html") ||
    t.startsWith("<!doctype html") ||
    t.startsWith("<html") ||
    t.startsWith("<svg") ||
    t.startsWith("<?xml")
  ) {
    return { type: "web_preview", language: "html" };
  }

  // Diff
  if (t.startsWith("diff --git") || t.startsWith("--- a/") || t.startsWith("+++ b/")) {
    return { type: "diff", language: "diff" };
  }

  // JSON (object or array)
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try {
      JSON.parse(t);
      return { type: "code", language: "json" };
    } catch {
      // Not valid JSON, continue
    }
  }

  // Java
  if (
    t.startsWith("public class") ||
    t.startsWith("public interface") ||
    t.startsWith("public enum") ||
    t.startsWith("class ") ||
    t.startsWith("@Override") ||
    t.startsWith("package ")
  ) {
    return { type: "code", language: "java" };
  }

  // C/C++
  if (
    t.startsWith("#include") ||
    t.startsWith("int main") ||
    t.startsWith("void main") ||
    t.startsWith("using namespace")
  ) {
    return { type: "code", language: "cpp" };
  }

  // Go
  if (t.startsWith("package main") || (t.startsWith("func ") && t.includes("package "))) {
    return { type: "code", language: "go" };
  }

  // Python
  if (
    t.startsWith("import ") ||
    t.startsWith("from ") ||
    t.startsWith("def ") ||
    t.startsWith("class ") ||
    t.startsWith("#!/usr/bin/env python")
  ) {
    return { type: "code", language: "python" };
  }

  // Rust
  if (t.startsWith("fn ") || t.startsWith("let ") || t.startsWith("use ")) {
    return { type: "code", language: "rust" };
  }

  // TypeScript/JavaScript
  if (
    t.startsWith("import ") ||
    t.startsWith("export ") ||
    t.startsWith("const ") ||
    t.startsWith("let ") ||
    t.startsWith("function ") ||
    t.startsWith("interface ") ||
    t.startsWith("type ")
  ) {
    return { type: "code", language: "typescript" };
  }

  return null;
}

// ─── Extract filename from tool input ──────────────────────────────────

function extractFilename(input: Record<string, unknown>): string | null {
  const candidates = ["file", "filename", "path", "filePath", "file_path", "target"];
  for (const key of candidates) {
    const val = input[key];
    if (typeof val === "string" && val.includes(".")) {
      return val;
    }
  }
  return null;
}

// ─── Extract display content from tool input ───────────────────────────

function extractDisplayContent(input: Record<string, unknown>): string {
  // Common content fields in various tools
  const contentCandidates = ["content", "body", "html", "code", "text", "data", "markdown"];
  for (const key of contentCandidates) {
    const val = input[key];
    if (typeof val === "string" && val.length > 0) {
      return val;
    }
  }
  // If no direct content field, stringify the whole input minus known metadata fields
  const skipKeys = new Set(["file", "filename", "path", "filePath", "file_path", "target", "action", "operation", "mode"]);
  const relevant: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!skipKeys.has(k)) {
      relevant[k] = v;
    }
  }
  if (Object.keys(relevant).length > 0) {
    return JSON.stringify(relevant, null, 2);
  }
  return JSON.stringify(input, null, 2);
}

// ─── Derive title from filename or type ────────────────────────────────

function deriveTitle(type: ArtifactType, language: string, filename: string | null, input: Record<string, unknown>): string {
  if (filename) {
    // Use filename without path
    const parts = filename.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1]!;
  }
  // Try title field
  if (typeof input.title === "string" && input.title.length > 0) {
    return input.title;
  }
  // Fall back to type-based default
  const titles: Record<string, string> = {
    web_preview: "Web Preview",
    code: `Code (${language})`,
    diff: "Code Diff",
    document: "Document",
  };
  return titles[type] ?? "Artifact";
}

// ─── Chunk processing (for integration with adapter loops) ──────────────

/**
 * Process a chunk from the adapter stream.
 *
 * If it's a ToolCall that contains detectable artifact content, replaces its
 * content with `~~~artifact:type:title~~~` markers and changes type to Text.
 * Otherwise returns the chunk unchanged.
 *
 * Usage in `runAgentExecution()` / `SubTaskExecutor.execute()`:
 *   const processed = processChunk(chunk);
 *   fullResponse += processed.content;
 *   pushChunk(cm, convId, processed, agentId);
 */
export function processChunk(chunk: Chunk): Chunk {
  if (chunk.type !== ChunkType.ToolCall) return chunk;

  let toolData: { name?: string; input?: Record<string, unknown> } | undefined;
  try {
    toolData = JSON.parse(chunk.content) as Record<string, unknown>;
  } catch {
    return chunk;
  }

  if (!toolData?.input) return chunk;

  const result = detectArtifact(toolData.input);
  if (!result) return chunk;

  const markerContent = insertArtifactMarker("", result.type, result.title, result.content);

  return {
    type: ChunkType.Text,
    content: markerContent,
    timestamp: chunk.timestamp,
  };
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Detect whether tool call input contains an artifact, using dual-channel detection.
 *
 * Channel 1 — file extension (preferred):
 *   Looks for `file`/`filename`/`path` in input, maps extension to artifact type.
 *
 * Channel 2 — content sniffing (fallback):
 *   Analyzes the stringified input content for known patterns.
 *
 * Returns null if no artifact is detected.
 */
export function detectArtifact(
  inputRaw: string | Record<string, unknown> | undefined,
): ArtifactDetectionResult | null {
  if (!inputRaw) return null;

  const input: Record<string, unknown> | null =
    typeof inputRaw === "string" ? tryParseJSON(inputRaw) : inputRaw;
  if (!input) return null;

  if (!input || Object.keys(input).length === 0) return null;

  const filename = extractFilename(input);

  // Channel 1: File extension
  if (filename) {
    const ext = "." + filename.split(".").pop()?.toLowerCase();
    const mapping = EXTENSION_MAP[ext];
    if (mapping) {
      const content = extractDisplayContent(input);
      return {
        type: mapping.type,
        language: mapping.language,
        title: deriveTitle(mapping.type, mapping.language, filename, input),
        content,
      };
    }
  }

  // Channel 2: Content sniffing
  const displayContent = extractDisplayContent(input);
  if (!displayContent) return null;

  const sniffed = sniffFromContent(displayContent);
  if (sniffed) {
    return {
      type: sniffed.type,
      language: sniffed.language,
      title: deriveTitle(sniffed.type, sniffed.language, null, input),
      content: displayContent,
    };
  }

  return null;
}

/**
 * Insert artifact marker pair into a content string.
 *
 * Wraps `artifactContent` with `~~~artifact:type:title~~~` / `~~~artifact:end:type~~~`
 * and appends to `existingContent`.
 *
 * Returns the updated content string.
 */
export function insertArtifactMarker(
  existingContent: string,
  type: string,
  title: string,
  artifactContent: string,
): string {
  const marker = `\n~~~artifact:${type}:${title}~~~\n${artifactContent}\n~~~artifact:end:${type}~~~\n`;
  return existingContent + marker;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function tryParseJSON(input: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(input);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
      return { data: parsed };
    }
    return null;
  } catch {
    return null;
  }
}
