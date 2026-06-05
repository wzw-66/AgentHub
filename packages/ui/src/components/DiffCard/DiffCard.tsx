import type { CSSProperties } from "react";
import type { DiffCardProps } from "../../types.js";

const cardStyle: CSSProperties = {
  backgroundColor: "var(--ui-color-bg-card, rgba(255,255,255,0.6))",
  border: "1px solid var(--ui-color-border, rgba(0,0,0,0.06))",
  borderRadius: "var(--ui-radius-md, 10px)",
  overflow: "hidden",
  fontFamily: "var(--ui-font-mono)",
  fontSize: "10px",
  lineHeight: 1.7,
};

const titleBarStyle: CSSProperties = {
  padding: "6px 12px",
  backgroundColor: "var(--ui-color-bg-contact, #f7f6f3)",
  borderBottom: "1px solid var(--ui-color-border-light, #eeede9)",
  fontWeight: 600,
  fontSize: "var(--ui-font-sm, 11px)",
  color: "var(--ui-color-text-primary, #1a1a2e)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const applyBtnStyle: CSSProperties = {
  background: "var(--ui-color-success, #2b8a6b)",
  border: "none",
  borderRadius: "var(--ui-radius-sm, 6px)",
  cursor: "pointer",
  padding: "2px 12px",
  fontSize: "10px",
  color: "#fff",
  lineHeight: 1.5,
  fontWeight: 500,
};

const lineStyle: CSSProperties = {
  padding: "0 var(--ui-space-4, 16px)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  minHeight: "23px",
  display: "flex",
  alignItems: "center",
};

const addStyle: CSSProperties = {
  ...lineStyle,
  backgroundColor: "var(--ui-color-diff-add, rgba(43,138,107,0.08))",
  color: "var(--ui-color-diff-add-text, #2b8a6b)",
};

const removeStyle: CSSProperties = {
  ...lineStyle,
  backgroundColor: "var(--ui-color-diff-remove, rgba(201,58,58,0.08))",
  color: "var(--ui-color-diff-remove-text, #c93a3a)",
};

const neutralStyle: CSSProperties = {
  ...lineStyle,
  color: "var(--ui-color-text-primary, #1a1a2e)",
};

const ctxStyle: CSSProperties = {
  ...lineStyle,
  color: "var(--ui-color-text-secondary, #7c7a76)",
};

const placeholderStyle: CSSProperties = {
  padding: "var(--ui-space-8, 32px)",
  textAlign: "center",
  color: "var(--ui-color-text-secondary, #7c7a76)",
  fontFamily: "var(--ui-font-sans)",
};

const footStyle: CSSProperties = {
  padding: "6px 12px",
  borderTop: "1px solid var(--ui-color-border-light, #eeede9)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

export function DiffCard({
  diff,
  title,
  className = "",
  onApply,
}: DiffCardProps) {
  const lines = diff.split("\n");

  if (!diff.trim()) {
    return (
      <div style={cardStyle} className={className} data-testid="diffcard">
        <div style={placeholderStyle}>No changes</div>
      </div>
    );
  }

  const addCount = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
  const delCount = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length;

  return (
    <div style={cardStyle} className={className} data-testid="diffcard">
      {title && (
        <div style={titleBarStyle}>
          <span>{title}</span>
          {onApply && (
            <button style={applyBtnStyle} onClick={() => onApply(diff)} data-testid="diff-apply-btn">
              ✓ 全部应用
            </button>
          )}
        </div>
      )}
      <div className="diff-body" style={{ fontFamily: "var(--ui-font-mono)" }}>
        {lines.map((line, i) => {
          let style: CSSProperties = neutralStyle;
          if (line.startsWith("+") && !line.startsWith("+++")) {
            style = addStyle;
          } else if (line.startsWith("-") && !line.startsWith("---")) {
            style = removeStyle;
          } else if (!line.startsWith("@@")) {
            style = ctxStyle;
          }
          return (
            <div key={i} style={style} data-testid={`diff-line-${i}`}>
              {line}
            </div>
          );
        })}
      </div>
      <div style={footStyle}>
        <span style={{ color: "var(--ui-color-text-secondary, #7c7a76)", fontSize: "10px" }}>
          <span style={{ color: "var(--ui-color-diff-add-text, #2b8a6b)" }}>+{addCount}</span>{" "}
          <span style={{ color: "var(--ui-color-diff-remove-text, #c93a3a)" }}>-{delCount}</span>
        </span>
        <button
          className="text-xs cursor-pointer transition-colors"
          style={{
            border: "none",
            background: "none",
            color: "var(--ui-color-text-secondary, #7c7a76)",
            fontSize: "10px",
            fontFamily: "var(--ui-font-sans)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ui-color-text-primary, #1a1a2e)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ui-color-text-secondary, #7c7a76)"; }}
        >
          💬 追问修改
        </button>
      </div>
    </div>
  );
}
