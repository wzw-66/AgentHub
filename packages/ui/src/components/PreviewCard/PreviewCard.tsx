import { useState, type CSSProperties } from "react";
import type { PreviewCardProps } from "../../types.js";

const cardStyle: CSSProperties = {
  border: "1px solid var(--ui-color-border)",
  borderRadius: "var(--ui-radius-md)",
  overflow: "hidden",
  backgroundColor: "var(--ui-color-bg-card)",
};

const titleBarStyle: CSSProperties = {
  padding: "var(--ui-space-2) var(--ui-space-4)",
  backgroundColor: "var(--ui-color-bg-contact)",
  borderBottom: "1px solid var(--ui-color-border)",
  fontWeight: 600,
  fontSize: "var(--ui-font-sm)",
  color: "var(--ui-color-text-primary)",
};

const iframeContainerStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "16 / 9",
};

const iframeStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  border: "none",
};

const loadingStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "var(--ui-color-bg-contact)",
  color: "var(--ui-color-text-secondary)",
  fontSize: "var(--ui-font-sm)",
};

export function PreviewCard({
  url,
  title,
  className = "",
}: PreviewCardProps) {
  const [loading, setLoading] = useState(true);

  return (
    <div style={cardStyle} className={className} data-testid="previewcard">
      {title && <div style={titleBarStyle}>{title}</div>}
      <div style={iframeContainerStyle}>
        {loading && <div style={loadingStyle}>Loading preview...</div>}
        <iframe
          src={url}
          title={title ?? "Preview"}
          style={iframeStyle}
          sandbox="allow-scripts allow-same-origin"
          onLoad={() => setLoading(false)}
          data-testid="previewcard-iframe"
        />
      </div>
    </div>
  );
}
