import { useState, type CSSProperties } from "react";
import type { ArtifactCardProps } from "../../types.js";
import type { ArtifactStatus } from "@agenthub/shared";

const cardStyle: CSSProperties = {
  border: "1px solid var(--ui-color-border)",
  borderRadius: "var(--ui-radius-md)",
  overflow: "hidden",
  backgroundColor: "var(--ui-color-bg-card)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ui-space-3)",
  padding: "var(--ui-space-3) var(--ui-space-4)",
  borderBottom: "1px solid var(--ui-color-border-light)",
};

const titleStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: "var(--ui-font-base)",
  color: "var(--ui-color-text-primary)",
  flex: 1,
};

const bodyStyle: CSSProperties = {
  padding: "var(--ui-space-4)",
  fontSize: "var(--ui-font-sm)",
  color: "var(--ui-color-text-secondary)",
};

const spinnerStyle: CSSProperties = {
  width: 16,
  height: 16,
  border: "2px solid var(--ui-color-border)",
  borderTopColor: "var(--ui-color-primary)",
  borderRadius: "50%",
  animation: "ui-spin 0.8s linear infinite",
  flexShrink: 0,
};

const btnStyle: CSSProperties = {
  background: "none",
  border: "1px solid var(--ui-color-border-light)",
  borderRadius: "var(--ui-radius-sm)",
  cursor: "pointer",
  padding: "2px 8px",
  fontSize: "var(--ui-font-xs)",
  color: "var(--ui-color-text-secondary)",
  lineHeight: 1.4,
};

const STATUS_ICON: Record<ArtifactStatus, { icon: string; color: string }> = {
  building: { icon: "⏳", color: "var(--ui-color-primary)" },
  completed: { icon: "✅", color: "var(--ui-color-success)" },
  failed: { icon: "❌", color: "var(--ui-color-error)" },
};

const STATUS_TEXT: Record<ArtifactStatus, string> = {
  building: "Building...",
  completed: "Completed",
  failed: "Build failed",
};

export function ArtifactCard({
  artifact,
  className = "",
  onPreview,
  onFullscreen,
}: ArtifactCardProps) {
  const status: ArtifactStatus = artifact.status as ArtifactStatus;
  const icon = STATUS_ICON[status];
  const text = STATUS_TEXT[status];
  const [showPreview, setShowPreview] = useState(false);

  if (!icon || !text) return null;

  const handlePreview = () => {
    if (onPreview) {
      onPreview(artifact);
    } else {
      setShowPreview(!showPreview);
    }
  };

  return (
    <div style={cardStyle} className={className} data-testid="artifactcard">
      <div style={headerStyle}>
        {status === "building" && <div style={spinnerStyle} data-testid="artifact-spinner" />}
        <span style={{ fontSize: 16 }}>{icon.icon}</span>
        <span style={titleStyle}>{artifact.title}</span>
        <span
          style={{
            fontSize: "var(--ui-font-xs)",
            color: icon.color,
          }}
        >
          {text}
        </span>
        {status === "completed" && artifact.content && (
          <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
            {(onPreview || artifact.type === "web_preview") && (
              <button style={btnStyle} onClick={handlePreview} data-testid="artifact-preview-btn">
                Preview
              </button>
            )}
            {onFullscreen && (
              <button style={btnStyle} onClick={() => onFullscreen(artifact)} data-testid="artifact-fullscreen-btn">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14, display: "block" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
      <div style={bodyStyle}>
        {status === "building" && "Processing your request..."}
        {status === "completed" && showPreview && artifact.type === "web_preview" && artifact.content && (
          <iframe
            src={artifact.content}
            title={artifact.title}
            style={{
              width: "100%",
              height: 400,
              border: "1px solid var(--ui-color-border-light)",
              borderRadius: "var(--ui-radius-sm)",
            }}
            data-testid="artifact-iframe"
          />
        )}
        {status === "completed" && !(showPreview && artifact.type === "web_preview") &&
          (artifact.content
            ? artifact.content.slice(0, 200) + (artifact.content.length > 200 ? "..." : "")
            : "No content")}
        {status === "failed" && "An error occurred while building this artifact."}
      </div>
    </div>
  );
}
