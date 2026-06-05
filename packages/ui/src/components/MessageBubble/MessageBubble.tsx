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
    maxWidth: "88%" as const,
    content: {
      backgroundColor: "var(--ui-color-bg-user, #1a1a2e)",
      color: "#ffffff",
      borderRadius: "16px 4px 16px 16px",
      border: "none",
    },
  },
  contact: {
    alignItems: "flex-start" as const,
    maxWidth: "88%" as const,
    content: {
      backgroundColor: "var(--ui-color-bg-contact, #f7f6f3)",
      color: "var(--ui-color-text-primary, #1a1a2e)",
      borderRadius: "4px 16px 16px 16px",
      border: "1px solid var(--ui-color-border-light, #eeede9)",
    },
  },
  system: {
    alignItems: "center" as const,
    maxWidth: "80%" as const,
    content: {
      backgroundColor: "var(--ui-color-bg-system, rgba(0,0,0,0.03))",
      color: "var(--ui-color-text-secondary, #7c7a76)",
      fontSize: "var(--ui-font-sm, 11px)",
      borderRadius: "var(--ui-radius-md, 10px)",
      textAlign: "center" as const,
      border: "1px solid var(--ui-color-border-light, rgba(0,0,0,0.03))",
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
    borderLeft: "2px solid var(--ui-color-primary, #1a1a2e)",
    padding: "var(--ui-space-2, 8px) var(--ui-space-3, 12px)",
    marginBottom: "var(--ui-space-2, 8px)",
    fontSize: "var(--ui-font-sm, 11px)",
    color: "var(--ui-color-text-secondary, #7c7a76)",
    backgroundColor: "var(--ui-color-bg-contact, #f7f6f3)",
    borderRadius: "0 var(--ui-radius-sm, 6px) var(--ui-radius-sm, 6px) 0",
  };

  const labelStyle: CSSProperties = {
    fontSize: "var(--ui-font-xs, 10px)",
    fontWeight: 600,
    marginBottom: "var(--ui-space-1, 4px)",
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

  const bubbleStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    maxWidth: v.maxWidth,
    marginBottom: "var(--ui-space-3, 12px)",
    gap: "var(--ui-space-1, 4px)",
    alignItems: v.alignItems,
  };

  const contentStyle: CSSProperties = {
    padding: "10px 15px",
    fontSize: "13px",
    lineHeight: 1.6,
    letterSpacing: "-0.01em",
    wordWrap: "break-word",
    whiteSpace: "pre-wrap",
    ...v.content,
  };

  const quoteStyle: CSSProperties = {
    marginBottom: "var(--ui-space-2, 8px)",
    padding: "var(--ui-space-1, 4px) var(--ui-space-2, 8px)",
    borderLeft: "2px solid var(--ui-color-primary, #1a1a2e)",
    backgroundColor: "var(--ui-color-bg-system, rgba(0,0,0,0.03))",
    borderRadius: "var(--ui-radius-sm, 6px)",
    fontSize: "var(--ui-font-sm, 11px)",
    color: "var(--ui-color-text-secondary, #7c7a76)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const timestampStyle: CSSProperties = {
    fontSize: "9px",
    color: "var(--ui-color-text-secondary, #7c7a76)",
    padding: "0 var(--ui-space-1, 4px)",
    fontFamily: "var(--ui-font-mono, monospace)",
    opacity: 0.6,
  };

  return (
    <div
      style={bubbleStyle}
      className={className ? `ui-mb-${variant} ${className}` : `ui-mb-${variant}`}
      data-testid={`message-bubble-${variant}`}
    >
      {parentMessage && (
        <div style={quoteStyle} data-testid="message-quote">
          {parentMessage.content}
        </div>
      )}
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
