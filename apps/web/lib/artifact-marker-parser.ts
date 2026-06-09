// ─── Types ────────────────────────────────────────────────────────────

export type ArtifactBlockType = "code" | "web_preview" | "diff" | "document";

export type TextBlock = {
  type: "text";
  content: string;
};

export type ArtifactContentBlock = {
  type: ArtifactBlockType;
  title: string;
  content: string;
};

export type ContentBlock = TextBlock | ArtifactContentBlock;

// ─── Regex ────────────────────────────────────────────────────────────

/**
 * Match `~~~artifact:type:title~~~...~~~artifact:end:type~~~` blocks.
 *
 * - Group 1: type (e.g., "code", "web_preview", "diff", "document")
 * - Group 2: title (e.g., "index.html", "main.ts")
 * - Group 3: content (everything between open and close markers)
 */
const ARTIFACT_MARKER_RE = /~~~artifact:(\w+):(.+?)~~~([\s\S]*?)~~~artifact:end:\w+~~~/g;

// ─── Parser ───────────────────────────────────────────────────────────

/**
 * Parse a string containing `~~~artifact` markers into an ordered array
 * of text blocks and artifact content blocks.
 *
 * Rules:
 * - Text between markers and outside markers → `{ type: "text", content }`
 * - Matched marker pairs → `{ type, title, content }`
 * - Unclosed markers (open without matching close) → treated as plain text
 * - Supports multiple artifacts in a single string
 * - Empty strings → single text block with empty content
 */
export function parseArtifactMarkers(content: string): ContentBlock[] {
  if (!content) {
    return [{ type: "text", content: "" }];
  }

  const blocks: ContentBlock[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state (global regex retains lastIndex across calls)
  ARTIFACT_MARKER_RE.lastIndex = 0;

  while ((match = ARTIFACT_MARKER_RE.exec(content)) !== null) {
    const [fullMatch, type, title, artifactContent] = match;

    // Push text before this marker
    if (match.index > lastIndex) {
      const before = content.slice(lastIndex, match.index);
      if (before) {
        blocks.push({ type: "text", content: before });
      }
    }

    // Push artifact block (non-null assertion: regex guarantees these groups exist on match)
    const artifactType = type as ArtifactBlockType;
    blocks.push({
      type: artifactType,
      title: title ?? "",
      content: artifactContent ?? "",
    });

    lastIndex = match.index + fullMatch.length;
  }

  // Push remaining text after last marker
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    if (remaining) {
      blocks.push({ type: "text", content: remaining });
    }
  }

  // No markers found — return whole content as single text block
  if (blocks.length === 0) {
    blocks.push({ type: "text", content });
  }

  return blocks;
}
