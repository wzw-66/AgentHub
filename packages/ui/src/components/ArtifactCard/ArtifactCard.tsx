import type { CSSProperties } from "react";
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
}: ArtifactCardProps) {
  const status: ArtifactStatus = artifact.status as ArtifactStatus;
  const icon = STATUS_ICON[status];
  const text = STATUS_TEXT[status];

  if (!icon || !text) return null;

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
      </div>
      <div style={bodyStyle}>
        {status === "building" && "Processing your request..."}
        {status === "completed" &&
          (artifact.content
            ? artifact.content.slice(0, 200) + (artifact.content.length > 200 ? "..." : "")
            : "No content")}
        {status === "failed" && "An error occurred while building this artifact."}
      </div>
    </div>
  );
}
