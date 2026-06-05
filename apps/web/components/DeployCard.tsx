"use client";

interface DeployCardProps {
  url: string;
  status: "deploying" | "running" | "failed";
}

const STATUS_CONFIG = {
  deploying: { label: "部署中...", color: "var(--amber)", bg: "#fff8e1" },
  running: { label: "已部署 · 运行中", color: "var(--green)", bg: "var(--green-bg)" },
  failed: { label: "部署失败", color: "var(--red)", bg: "rgba(201,58,58,0.08)" },
};

export default function DeployCard({ url, status }: DeployCardProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div
      className="deploy-card"
      style={{
        background: config.bg,
        borderColor:
          status === "running"
            ? "rgba(43,138,107,0.15)"
            : status === "failed"
              ? "rgba(201,58,58,0.15)"
              : "rgba(184,134,11,0.15)",
      }}
    >
      <div className="flex items-center gap-2.5">
        {status === "deploying" ? (
          <div
            style={{
              width: "16px",
              height: "16px",
              border: "2px solid var(--border)",
              borderTopColor: config.color,
              borderRadius: "50%",
              animation: "ui-spin 0.8s linear infinite",
            }}
          />
        ) : (
          <span className="dot" />
        )}
        <span
          className="font-semibold"
          style={{
            color: config.color,
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
          }}
        >
          {config.label}
        </span>
      </div>
      <div
        style={{
          color: "var(--text-tertiary)",
          fontSize: "11px",
          marginTop: "6px",
          fontFamily: "var(--font-mono)",
        }}
      >
        <strong style={{ color: "var(--text-secondary)" }}>✦</strong> {url}
      </div>
      {status === "running" && (
        <button
          className="w-full font-medium transition-opacity cursor-pointer"
          style={{
            marginTop: "10px",
            background: "var(--green)",
            border: "none",
            color: "#fff",
            padding: "5px 14px",
            borderRadius: "var(--radius-sm)",
            fontSize: "11px",
            fontFamily: "var(--font-sans)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        >
          访问网站
        </button>
      )}
      {status === "failed" && (
        <button
          className="w-full font-medium transition-opacity cursor-pointer"
          style={{
            marginTop: "10px",
            background: "var(--red)",
            border: "none",
            color: "#fff",
            padding: "5px 14px",
            borderRadius: "var(--radius-sm)",
            fontSize: "11px",
            fontFamily: "var(--font-sans)",
          }}
        >
          重试部署
        </button>
      )}
    </div>
  );
}
