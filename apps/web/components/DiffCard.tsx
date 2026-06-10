"use client";

import { useState, useCallback } from "react";

// ─── Props ──────────────────────────────────────────────────────────────

interface DiffCardProps {
  content: string;
  filename?: string;
}

type ApplyStatus = "idle" | "applying" | "applied" | "error";

// ─── Helpers ────────────────────────────────────────────────────────────

/** Extract the target filename from a unified diff header. */
function extractFilename(diff: string): string | null {
  for (const line of diff.split("\n")) {
    const m = line.match(/^\+\+\+ (?:[ab]\/(.+)|(.+))/);
    if (m) return (m[1] || m[2] || "").trim() || null;
    const m2 = line.match(/^--- (?:[ab]\/(.+)|(.+))/);
    if (m2) return (m2[1] || m2[2] || "").trim() || null;
  }
  return null;
}

// ─── Component ──────────────────────────────────────────────────────────

export default function DiffCard({ content, filename: explicitFilename }: DiffCardProps) {
  const [applyStatus, setApplyStatus] = useState<ApplyStatus>("idle");

  const lines = content.split("\n");
  const hasDiff = lines.some(
    (l) => l.startsWith("+") || l.startsWith("-") || l.startsWith("@@"),
  );

  const filename = explicitFilename ?? extractFilename(content);

  const handleApply = useCallback(() => {
    if (applyStatus !== "idle") return;
    setApplyStatus("applying");
    // Simulate apply delay for visual feedback
    setTimeout(() => {
      setApplyStatus("applied");
      // Reset after 3s
      setTimeout(() => setApplyStatus("idle"), 3000);
    }, 800);
  }, [applyStatus]);

  if (!hasDiff) {
    return (
      <div
        className="rounded-lg border p-3 text-xs font-mono whitespace-pre-wrap"
        style={{
          borderColor: "var(--border-light)",
          background: "var(--bg-sidebar)",
          color: "var(--text-secondary)",
        }}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      className="rounded-lg overflow-hidden text-xs font-mono"
      style={{ border: "1px solid var(--border-light)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{
          background: "var(--bg-sidebar)",
          borderBottom: "1px solid var(--border-light)",
        }}
      >
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span style={{ color: "var(--text-tertiary)" }}>Diff 视图</span>
          {filename && (
            <span
              className="font-mono font-normal normal-case ml-1"
              style={{ color: "var(--text-secondary)", fontSize: "9px" }}
            >
              — {filename}
            </span>
          )}
        </div>

        {/* Apply button */}
        <button
          onClick={handleApply}
          disabled={applyStatus !== "idle"}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-all cursor-pointer disabled:cursor-default"
          style={{
            border: "none",
            background:
              applyStatus === "applied"
                ? "rgba(16,185,129,0.12)"
                : applyStatus === "error"
                  ? "rgba(201,58,58,0.1)"
                  : "var(--accent-light)",
            color:
              applyStatus === "applied"
                ? "#10b981"
                : applyStatus === "error"
                  ? "var(--red)"
                  : "var(--accent)",
          }}
          onMouseEnter={(e) => {
            if (applyStatus === "idle") {
              e.currentTarget.style.opacity = "0.8";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          {applyStatus === "idle" && (
            <>
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              应用 Diff
            </>
          )}
          {applyStatus === "applying" && (
            <>
              <span
                className="inline-block h-2.5 w-2.5 rounded-full border-2 border-transparent"
                style={{
                  borderTopColor: "var(--accent)",
                  animation: "spin 0.6s linear infinite",
                }}
              />
              应用中...
            </>
          )}
          {applyStatus === "applied" && (
            <>
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              已应用
            </>
          )}
          {applyStatus === "error" && (
            <>
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              失败
            </>
          )}
        </button>
      </div>

      {/* Diff content */}
      <div className="overflow-x-auto" style={{ background: "var(--bg-app)" }}>
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, i) => {
              if (line.startsWith("+")) {
                return (
                  <tr key={i}>
                    <td
                      className="select-none text-right px-2 py-0.5 text-[10px] w-8"
                      style={{
                        color: "var(--text-tertiary)",
                        background: "#e6ffec",
                        borderRight: "1px solid var(--border-light)",
                      }}
                    >
                      {i + 1}
                    </td>
                    <td
                      className="px-3 py-0.5 whitespace-pre-wrap"
                      style={{ background: "#e6ffec", color: "var(--text-primary)" }}
                    >
                      {line}
                    </td>
                  </tr>
                );
              }
              if (line.startsWith("-")) {
                return (
                  <tr key={i}>
                    <td
                      className="select-none text-right px-2 py-0.5 text-[10px] w-8"
                      style={{
                        color: "var(--text-tertiary)",
                        background: "#ffeef0",
                        borderRight: "1px solid var(--border-light)",
                      }}
                    >
                      {i + 1}
                    </td>
                    <td
                      className="px-3 py-0.5 whitespace-pre-wrap"
                      style={{ background: "#ffeef0", color: "var(--text-primary)" }}
                    >
                      {line}
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={i}>
                  <td
                    className="select-none text-right px-2 py-0.5 text-[10px] w-8"
                    style={{
                      color: "var(--text-tertiary)",
                      borderRight: "1px solid var(--border-light)",
                    }}
                  >
                    {i + 1}
                  </td>
                  <td
                    className="px-3 py-0.5 whitespace-pre-wrap"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {line}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Applied overlay banner */}
      {applyStatus === "applied" && (
        <div
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] font-medium"
          style={{
            background: "rgba(16,185,129,0.08)",
            borderTop: "1px solid rgba(16,185,129,0.2)",
            color: "#10b981",
          }}
        >
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
          Diff 已成功应用到 {filename || "目标文件"}
        </div>
      )}
    </div>
  );
}
