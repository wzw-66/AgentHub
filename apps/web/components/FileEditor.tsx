"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";

// ─── Types ────────────────────────────────────────────────────────────

interface FileContentData {
  path: string;
  content: string;
  size: number;
  encoding: string;
  isText: boolean;
}

interface FileEditorProps {
  conversationId: string;
  filePath: string;
  onClose?: () => void;
}

// ─── Language detection for syntax highlighting ───────────────────────

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    html: "html",
    htm: "html",
    css: "css",
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    json: "json",
    md: "markdown",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    svg: "xml",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    vue: "vue",
    svelte: "svelte",
  };
  return map[ext] ?? "text";
}

// ─── FileEditor Component ─────────────────────────────────────────────

export default function FileEditor({ conversationId, filePath, onClose }: FileEditorProps) {
  const [data, setData] = useState<FileContentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadFile() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await api.post<FileContentData>(
          `/api/files/${conversationId}/read`,
          { path: filePath },
        );
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "读取文件失败");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadFile();
    return () => { cancelled = true; };
  }, [conversationId, filePath]);

  // Determine if content is HTML/SVG for preview
  const isPreviewable = data && (
    filePath.endsWith(".html") ||
    filePath.endsWith(".htm") ||
    filePath.endsWith(".svg")
  );

  // ─── Loading state ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ padding: "40px 0" }}>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          加载中...
        </span>
      </div>
    );
  }

  // ─── Error state ──────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center gap-2" style={{ padding: "24px 0" }}>
        <span className="text-xs" style={{ color: "var(--red)" }}>
          {error}
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="text-[10px] transition-colors cursor-pointer"
            style={{
              color: "var(--text-tertiary)",
              background: "none",
              border: "none",
            }}
          >
            关闭
          </button>
        )}
      </div>
    );
  }

  if (!data) return null;

  const language = detectLanguage(filePath);

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg"
      style={{
        border: "1px solid var(--border-light)",
        background: "var(--bg-app)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{
          borderBottom: "1px solid var(--border-light)",
          background: "var(--bg-sidebar)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-[10px] font-mono truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {filePath}
          </span>
          <span
            className="rounded px-1.5 py-0.5 text-[9px] font-medium"
            style={{
              background: "var(--bg-hover)",
              color: "var(--text-tertiary)",
            }}
          >
            {language}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {data.size > 0 && (
            <span
              className="text-[9px]"
              style={{ color: "var(--text-tertiary)" }}
            >
              {data.size > 1024
                ? `${(data.size / 1024).toFixed(1)}KB`
                : `${data.size}B`}
            </span>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="rounded p-1 text-[10px] transition-colors cursor-pointer"
              style={{
                color: "var(--text-tertiary)",
                background: "none",
                border: "none",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isPreviewable ? (
        <div className="flex-1">
          {/* Tab: Code | Preview */}
          <FilePreviewTabs
            filePath={filePath}
            content={data.content}
          />
        </div>
      ) : (
        <div className="overflow-auto" style={{ maxHeight: "400px" }}>
          <pre
            className="whitespace-pre-wrap font-mono text-xs leading-relaxed"
            style={{
              color: "var(--text-primary)",
              padding: "12px",
              margin: 0,
              tabSize: 2,
            }}
          >
            {data.content}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Tabs: Code / Preview ─────────────────────────────────────────────

function FilePreviewTabs({
  filePath,
  content,
}: {
  filePath: string;
  content: string;
}) {
  const [activeTab, setActiveTab] = useState<"code" | "preview">(
    filePath.endsWith(".svg") ? "preview" : "code",
  );

  return (
    <div className="flex flex-col">
      {/* Tab bar */}
      <div
        className="flex gap-0 px-2"
        style={{ borderBottom: "1px solid var(--border-light)" }}
      >
        <TabButton
          label="代码"
          active={activeTab === "code"}
          onClick={() => setActiveTab("code")}
        />
        <TabButton
          label="预览"
          active={activeTab === "preview"}
          onClick={() => setActiveTab("preview")}
        />
      </div>

      {/* Tab content */}
      {activeTab === "code" ? (
        <div className="overflow-auto" style={{ maxHeight: "400px" }}>
          <pre
            className="whitespace-pre-wrap font-mono text-xs leading-relaxed"
            style={{
              color: "var(--text-primary)",
              padding: "12px",
              margin: 0,
              tabSize: 2,
            }}
          >
            {content}
          </pre>
        </div>
      ) : (
        <div className="flex-1" style={{ minHeight: "300px" }}>
          <iframe
            className="h-full w-full border-0"
            srcDoc={content}
            title="Preview"
            sandbox="allow-scripts"
            style={{
              backgroundColor: "#fff",
              minHeight: "300px",
              width: "100%",
            }}
          />
        </div>
      )}
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-[10px] font-medium transition-colors cursor-pointer"
      style={{
        padding: "6px 10px",
        border: "none",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        background: "none",
        color: active ? "var(--accent)" : "var(--text-tertiary)",
      }}
    >
      {label}
    </button>
  );
}
