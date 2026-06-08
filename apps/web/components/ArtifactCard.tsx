"use client";

interface ArtifactCardProps {
  content: string;
  status?: string;
  title?: string;
  onPreview?: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  building: { label: "构建中...", color: "var(--amber)" },
  completed: { label: "已完成", color: "var(--green)" },
  failed: { label: "失败", color: "var(--red)" },
};

export default function ArtifactCard({ content, status, title, onPreview }: ArtifactCardProps) {
  const statusInfo = STATUS_CONFIG[status ?? ""] ?? { label: "未知", color: "var(--text-tertiary)" };

  return (
    <div
      className="rounded-lg overflow-hidden text-xs"
      style={{ border: "1px solid var(--border-light)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ background: "var(--bg-sidebar)", borderBottom: "1px solid var(--border-light)" }}
      >
        <div className="flex items-center gap-2">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="var(--accent)" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>
            {title || "Artifact"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px]" style={{ color: statusInfo.color }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: statusInfo.color }} />
            {statusInfo.label}
          </span>
          {onPreview && (
            <button
              onClick={onPreview}
              className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
              style={{ color: "var(--accent)", background: "var(--accent-light)" }}
            >
              预览
            </button>
          )}
        </div>
      </div>

      {/* Content preview */}
      <div
        className="px-3 py-2 max-h-24 overflow-y-auto font-mono whitespace-pre-wrap leading-relaxed"
        style={{ background: "var(--bg-app)", color: "var(--text-secondary)" }}
      >
        {content.slice(0, 500)}
        {content.length > 500 && (
          <span style={{ color: "var(--text-tertiary)" }}> ...</span>
        )}
      </div>
    </div>
  );
}
