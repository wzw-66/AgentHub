"use client";

interface SilentAlertCardProps {
  severity: "critical" | "high" | "medium";
  description: string;
  filePath: string;
  line?: number;
  suggestion: string;
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: "严重",
  high: "高",
  medium: "中",
};

export default function SilentAlertCard({
  severity,
  description,
  filePath,
  line,
  suggestion,
}: SilentAlertCardProps) {
  return (
    <div className="silent-alert">
      <div className="alert-hdr">
        <span style={{ fontSize: "10px" }}>🎧</span>
        发现 1 个安全问题 · {SEVERITY_LABELS[severity] ?? severity}
      </div>
      <div className="alert-body">
        <div style={{ marginBottom: "4px" }}>
          <b>位置：</b>{filePath}{line ? ` 第 ${line} 行` : ""}
        </div>
        <div style={{ marginBottom: "4px" }}>
          <b>问题：</b>{description}
        </div>
        <div>
          <b>建议：</b>{suggestion}
        </div>
      </div>
    </div>
  );
}
