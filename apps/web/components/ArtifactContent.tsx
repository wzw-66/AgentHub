"use client";

import { MarkdownRenderer } from "./MarkdownRenderer";

// ─── Types ─────────────────────────────────────────────────────────────

type ContentSegment =
  | { kind: "text"; content: string }
  | { kind: "artifact"; type: string; title: string; content: string };

// ─── Marker parsing ───────────────────────────────────────────────────

const ARTIFACT_REGEX = /~~~artifact:(\w+):(.+?)~~~\n([\s\S]*?)~~~artifact:end:\w+~~~/g;

function parseContent(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ARTIFACT_REGEX.exec(content)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      segments.push({ kind: "text", content: content.slice(lastIndex, match.index) });
    }

    segments.push({
      kind: "artifact",
      type: match[1]!,
      title: match[2]!,
      content: match[3]!.trim(),
    });

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last match
  if (lastIndex < content.length) {
    segments.push({ kind: "text", content: content.slice(lastIndex) });
  }

  return segments;
}

// ─── Styles ────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--theme-border, #e5e7eb)",
  borderRadius: "8px",
  overflow: "hidden",
  margin: "8px 0",
  backgroundColor: "var(--theme-bg-card, #fff)",
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "8px 12px",
  borderBottom: "1px solid var(--theme-border-light, #f3f4f6)",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--theme-text-primary, #111)",
};

const typeBadgeStyle: React.CSSProperties = {
  fontSize: "10px",
  padding: "1px 6px",
  borderRadius: "4px",
  backgroundColor: "var(--theme-accent-dim, #eef2ff)",
  color: "var(--theme-accent, #6366f1)",
  fontWeight: 500,
};

const codeCardStyle: React.CSSProperties = {
  ...cardStyle,
  border: "1px solid var(--theme-border-light, #e5e7eb)",
};

const codePreStyle: React.CSSProperties = {
  margin: 0,
  padding: "12px",
  fontSize: "12px",
  lineHeight: 1.5,
  overflowX: "auto",
  backgroundColor: "var(--theme-bg-code, #1e1e2e)",
  color: "#cdd6f4",
};

// ─── Component ─────────────────────────────────────────────────────────

function InlineArtifactBlock({ type, title, content }: { type: string; title: string; content: string }) {
  // web_preview: render HTML via srcdoc iframe
  if (type === "web_preview") {
    return (
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <span>🌐</span>
          <span>{title}</span>
          <span style={typeBadgeStyle}>Preview</span>
        </div>
        <iframe
          srcDoc={content}
          title={title}
          sandbox="allow-scripts allow-same-origin"
          style={{
            width: "100%",
            height: 300,
            border: "none",
          }}
        />
      </div>
    );
  }

  // code: render syntax-highlighted code block with language badge
  if (type === "code") {
    return (
      <div style={codeCardStyle}>
        <div style={cardHeaderStyle}>
          <span>📄</span>
          <span>{title}</span>
          <span style={typeBadgeStyle}>{title.split(".").pop() ?? "code"}</span>
        </div>
        <pre style={codePreStyle}>
          <code>{content}</code>
        </pre>
      </div>
    );
  }

  // diff: render diff view
  if (type === "diff") {
    return (
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <span>📝</span>
          <span>{title}</span>
          <span style={typeBadgeStyle}>Diff</span>
        </div>
        <pre style={codePreStyle}>
          <code>{content}</code>
        </pre>
      </div>
    );
  }

  // document / fallback
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <span>📄</span>
        <span>{title}</span>
        <span style={typeBadgeStyle}>Document</span>
      </div>
      <div style={{ padding: "12px", fontSize: "13px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
        {content}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────

/**
 * Renders message content with inline artifact markers.
 *
 * Parses `~~~artifact:type:title~~~` markers and renders:
 * - web_preview → iframe with srcdoc
 * - code → code block with language badge
 * - diff → diff view block
 * - document → text card
 * - Non-artifact text → rendered via MarkdownRenderer
 */
export function ArtifactContent({ content }: { content: string }) {
  const segments = parseContent(content);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          return <MarkdownRenderer key={i} content={seg.content} />;
        }
        return <InlineArtifactBlock key={`art-${i}`} type={seg.type} title={seg.title} content={seg.content} />;
      })}
    </>
  );
}

/**
 * Detect whether content contains artifact markers.
 * Used by ChatPanel to decide whether to use ArtifactContent or MarkdownRenderer.
 */
export function hasArtifactMarkers(content: string): boolean {
  return ARTIFACT_REGEX.test(content);
}
