import type { CSSProperties } from "react";
import type { DiffCardProps } from "../../types.js";

const cardStyle: CSSProperties = {
  backgroundColor: "var(--ui-color-bg-card)",
  border: "1px solid var(--ui-color-border)",
  borderRadius: "var(--ui-radius-md)",
  overflow: "hidden",
  fontFamily: "var(--ui-font-mono)",
  fontSize: "var(--ui-font-sm)",
  lineHeight: 1.6,
};

const titleBarStyle: CSSProperties = {
  padding: "var(--ui-space-2) var(--ui-space-4)",
  backgroundColor: "var(--ui-color-bg-contact)",
  borderBottom: "1px solid var(--ui-color-border)",
  fontWeight: 600,
  fontSize: "var(--ui-font-sm)",
  color: "var(--ui-color-text-primary)",
};

const lineStyle: CSSProperties = {
  padding: "0 var(--ui-space-4)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
};

const addStyle: CSSProperties = {
  ...lineStyle,
  backgroundColor: "var(--ui-color-diff-add)",
  color: "var(--ui-color-diff-add-text)",
};

const removeStyle: CSSProperties = {
  ...lineStyle,
  backgroundColor: "var(--ui-color-diff-remove)",
  color: "var(--ui-color-diff-remove-text)",
};

const neutralStyle: CSSProperties = {
  ...lineStyle,
  color: "var(--ui-color-text-primary)",
};

const placeholderStyle: CSSProperties = {
  padding: "var(--ui-space-8)",
  textAlign: "center",
  color: "var(--ui-color-text-secondary)",
  fontFamily: "var(--ui-font-sans)",
};

export function DiffCard({
  diff,
  title,
  className = "",
}: DiffCardProps) {
  const lines = diff.split("\n");

  if (!diff.trim()) {
    return (
      <div style={cardStyle} className={className} data-testid="diffcard">
        <div style={placeholderStyle}>No changes</div>
      </div>
    );
  }

  return (
    <div style={cardStyle} className={className} data-testid="diffcard">
      {title && <div style={titleBarStyle}>{title}</div>}
      {lines.map((line, i) => {
        let style: CSSProperties = neutralStyle;
        if (line.startsWith("+") && !line.startsWith("+++")) {
          style = addStyle;
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          style = removeStyle;
        }
        return (
          <div key={i} style={style} data-testid={`diff-line-${i}`}>
            {line}
          </div>
        );
      })}
    </div>
  );
}
