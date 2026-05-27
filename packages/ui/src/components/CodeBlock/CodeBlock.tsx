import { useState, useCallback, type CSSProperties } from "react";
import { Highlight, themes } from "prism-react-renderer";
import type { CodeBlockProps } from "../../types.js";

function getTheme() {
  return { ...themes.nightOwl, plain: { ...themes.nightOwl.plain, fontSize: "var(--ui-font-sm)" as unknown as number } };
}

const snippet = {
  padding: "var(--ui-space-4)",
  backgroundColor: "var(--ui-color-bg-code)",
  borderRadius: "var(--ui-radius-md)",
  overflow: "auto",
  position: "relative" as const,
  fontFamily: "var(--ui-font-mono)",
  fontSize: "var(--ui-font-sm)",
  lineHeight: 1.6,
};

const headerBar: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "var(--ui-space-2)",
};

const langLabel: CSSProperties = {
  fontSize: "var(--ui-font-xs)",
  color: "var(--ui-color-text-code)",
  opacity: 0.7,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const copyBtnBase: CSSProperties = {
  fontSize: "var(--ui-font-xs)",
  padding: "2px 8px",
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: "var(--ui-radius-sm)",
  cursor: "pointer",
  background: "transparent",
  color: "var(--ui-color-text-code)",
  transition: "all var(--ui-transition-fast)",
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
          borderColor: "var(--ui-color-success)",
          color: "var(--ui-color-success)",
        }
      : {}),
  };

  const content = (
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
      {content}
    </div>
  );
}
