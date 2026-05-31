import type { CSSProperties } from "react";
import type { MessageBubbleProps } from "../../types.js";
import type { Message } from "@agenthub/shared";

function formatTime(iso: string): string {
  const date = new Date(iso);
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

const variants = {
  user: {
    alignItems: "flex-end" as const,
    maxWidth: "100%" as const,
    content: {
      backgroundColor: "var(--ui-color-bg-contact)",
      color: "var(--ui-color-text-primary)",
      borderBottomRightRadius: "var(--ui-radius-sm)",
      borderTop: "1px solid var(--ui-color-border)",
      borderRight: "1px solid var(--ui-color-border)",
      borderBottom: "1px solid var(--ui-color-border)",
      borderLeft: "2px solid var(--ui-color-primary)",
    },
  },
  contact: {
    alignItems: "flex-start" as const,
    content: {
      backgroundColor: "var(--ui-color-bg-contact)",
      color: "var(--ui-color-text-primary)",
      borderBottomLeftRadius: "var(--ui-radius-sm)",
      borderTop: "1px solid var(--ui-color-border)",
      borderRight: "1px solid var(--ui-color-border)",
      borderBottom: "1px solid var(--ui-color-border)",
      borderLeft: "2px solid var(--ui-color-primary)",
    },
  },
  system: {
    alignItems: "center" as const,
    maxWidth: "100%" as const,
    content: {
      backgroundColor: "var(--ui-color-bg-system)",
      color: "var(--ui-color-text-secondary)",
      fontSize: "var(--ui-font-sm)",
      borderRadius: "var(--ui-radius-md)",
      textAlign: "center" as const,
      border: "1px solid var(--ui-color-border-light)",
    },
  },
} as const;

// ─── QuoteBlock ─────────────────────────────────────────────
const QUOTE_MAX_LENGTH = 150;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

function QuoteBlock({ message }: { message: Message }) {
  const quoteStyle: CSSProperties = {
    borderLeft: "2px solid var(--ui-color-primary)",
    padding: "var(--ui-space-2) var(--ui-space-3)",
    marginBottom: "var(--ui-space-2)",
    fontSize: "var(--ui-font-sm)",
    color: "var(--ui-color-text-secondary)",
    backgroundColor: "var(--ui-color-bg-contact)",
    borderRadius: "0 var(--ui-radius-sm) var(--ui-radius-sm) 0",
  };

  const labelStyle: CSSProperties = {
    fontSize: "var(--ui-font-xs)",
    fontWeight: 600,
    marginBottom: "var(--ui-space-1)",
    opacity: 0.7,
  };

  return (
    <div style={quoteStyle} data-testid="message-quote-block">
      <div style={labelStyle}>↳ Reply to message</div>
      <div style={{ whiteSpace: "pre-wrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {truncate(message.content, QUOTE_MAX_LENGTH)}
      </div>
    </div>
  );
}

// ─── MessageBubble ──────────────────────────────────────────
export function MessageBubble({
  message,
  variant,
  children,
  className = "",
  parentMessage,
}: MessageBubbleProps) {
  const v = variants[variant];
  const vMaxWidth = "maxWidth" in v ? v.maxWidth : "70%";

  const bubbleStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    maxWidth: vMaxWidth,
    marginBottom: "var(--ui-space-3)",
    gap: "var(--ui-space-1)",
    alignItems: v.alignItems,
  };

  const contentStyle: CSSProperties = {
    padding: "var(--ui-space-2) var(--ui-space-4)",
    borderRadius: "var(--ui-radius-lg)",
    fontSize: "var(--ui-font-base)",
    lineHeight: 1.5,
    wordWrap: "break-word",
    whiteSpace: "pre-wrap",
    ...v.content,
  };

  const timestampStyle: CSSProperties = {
    fontSize: "var(--ui-font-xs)",
    color: "var(--ui-color-text-secondary)",
    padding: "0 var(--ui-space-1)",
    fontFamily: "var(--ui-font-mono)",
    opacity: 0.7,
  };

  return (
    <div
      style={bubbleStyle}
      className={className ? `ui-mb-${variant} ${className}` : `ui-mb-${variant}`}
      data-testid={`message-bubble-${variant}`}
    >
      <div style={contentStyle} data-testid="message-content">
        {parentMessage && <QuoteBlock message={parentMessage} />}
        {children ?? message.content}
      </div>
      <span style={timestampStyle} data-testid="message-timestamp">
        {formatTime(message.createdAt)}
      </span>
    </div>
  );
}
