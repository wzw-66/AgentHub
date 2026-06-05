import { useState, useCallback, type CSSProperties } from "react";
import { Highlight, themes } from "prism-react-renderer";
import type { CodeBlockProps } from "../../types.js";

function getTheme() {
  return { ...themes.nightOwl, plain: { ...themes.nightOwl.plain, fontSize: "var(--ui-font-sm)" as unknown as number } };
}

const snippet: CSSProperties = {
  padding: "var(--ui-space-4)",
  backgroundColor: "var(--ui-color-bg-code, #faf9f7)",
  borderRadius: "var(--ui-radius-md, 10px)",
  overflow: "hidden",
  position: "relative" as const,
  fontFamily: "var(--ui-font-mono)",
  fontSize: "var(--ui-font-sm)",
  lineHeight: 1.5,
  border: "1px solid var(--ui-color-border-light, #eeede9)",
  wordBreak: "break-all",
  overflowWrap: "anywhere",
};

const headerBar: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "var(--ui-space-2)",
};

const langLabel: CSSProperties = {
  fontSize: "9px",
  color: "var(--ui-color-text-code, #1a1a2e)",
  opacity: 0.5,
  textTransform: "uppercase",
  letterSpacing: "0.8px",
  fontWeight: 500,
};

const copyBtnBase: CSSProperties = {
  fontSize: "var(--ui-font-xs, 10px)",
  padding: "2px 8px",
  border: "1px solid var(--ui-color-border, rgba(0,0,0,0.06))",
  borderRadius: "var(--ui-radius-sm, 6px)",
  cursor: "pointer",
  background: "transparent",
  color: "var(--ui-color-text-code, #1a1a2e)",
  transition: "all var(--ui-transition-fast, 150ms)",
};

const lineStyle: CSSProperties = {
  display: "table-row",
};

const lineNoStyle: CSSProperties = {
  display: "table-cell",
  textAlign: "right",
  paddingRight: "var(--ui-space-4)",
  userSelect: "none",
  opacity: 0.4,
  fontSize: "var(--ui-font-xs)",
};

const rowStyle: CSSProperties = {
  display: "table",
  tableLayout: "fixed",
  width: "100%",
  borderCollapse: "collapse",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  overflowWrap: "anywhere",
};

export function CodeBlock({
  code,
  language = "text",
  showLineNumbers = false,
  maxHeight,
  className = "",
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  const copyBtn: CSSProperties = {
    ...copyBtnBase,
    ...(copied
      ? {
          borderColor: "var(--ui-color-success, #2b8a6b)",
          color: "var(--ui-color-success, #2b8a6b)",
        }
      : {}),
  };

  const contentEl = (
    <Highlight theme={getTheme()} code={code.trimEnd()} language={language}>
      {({ tokens, getLineProps, getTokenProps }) => (
        <div style={rowStyle}>
          {tokens.map((line, i) => {
            const lineProps = getLineProps({ line });
            return (
              <div key={i} style={lineStyle} {...lineProps}>
                {showLineNumbers && (
                  <span style={lineNoStyle}>{i + 1}</span>
                )}
                <span style={{ display: "table-cell" }}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Highlight>
  );

  return (
    <div
      className={className}
      style={{ ...snippet, maxHeight: maxHeight ?? "none" }}
      data-testid="codeblock"
    >
      <div style={headerBar}>
        <span style={langLabel}>{language}</span>
        <button
          style={copyBtn}
          onClick={handleCopy}
          data-testid="codeblock-copy-btn"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {contentEl}
    </div>
  );
}
