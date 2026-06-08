"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";

// ─── Types ────────────────────────────────────────────────────────────

interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  children?: FileNode[];
}

interface FileExplorerProps {
  conversationId: string | null;
  onFileSelect?: (filePath: string) => void;
}

// ─── File icon map ────────────────────────────────────────────────────

const FILE_ICONS: Record<string, string> = {
  html: "🌐",
  htm: "🌐",
  css: "🎨",
  js: "📜",
  jsx: "⚛️",
  ts: "📘",
  tsx: "⚛️",
  json: "📋",
  md: "📝",
  py: "🐍",
  go: "🔵",
  rs: "🦀",
  java: "☕",
  c: "⚙️",
  cpp: "⚙️",
  h: "📐",
  sql: "🗃️",
  yaml: "⚙️",
  yml: "⚙️",
  toml: "⚙️",
  sh: "💻",
  bash: "💻",
  svg: "🖼️",
  xml: "📰",
  txt: "📄",
  env: "🔒",
  gitignore: "🙈",
  dockerfile: "🐳",
};

function getFileIcon(name: string, type: "file" | "dir"): string {
  if (type === "dir") return "📁";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const lower = name.toLowerCase();
  if (lower === "dockerfile") return "🐳";
  if (lower === "makefile") return "🔨";
  return FILE_ICONS[ext] ?? "📄";
}

function formatSize(bytes?: number): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ─── TreeNode Component ───────────────────────────────────────────────

function FileTreeNode({
  node,
  depth,
  onFileSelect,
  defaultExpanded,
}: {
  node: FileNode;
  depth: number;
  onFileSelect?: (path: string) => void;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const handleClick = () => {
    if (node.type === "dir") {
      setExpanded(!expanded);
    } else {
      onFileSelect?.(node.path);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors cursor-pointer text-left"
        style={{
          color: "var(--text-secondary)",
          paddingLeft: `${12 + depth * 16}px`,
          border: "none",
          background: "none",
          fontFamily: "var(--font-sans)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        title={node.path}
      >
        {node.type === "dir" && (
          <span className="flex-shrink-0 text-[10px]" style={{ width: "12px", textAlign: "center" }}>
            {expanded ? "▼" : "▶"}
          </span>
        )}
        <span className="flex-shrink-0">{getFileIcon(node.name, node.type)}</span>
        <span className="truncate flex-1" style={{ fontSize: "11px" }}>{node.name}</span>
        {node.type === "file" && node.size !== undefined && (
          <span className="flex-shrink-0" style={{ color: "var(--text-tertiary)", fontSize: "9px" }}>
            {formatSize(node.size)}
          </span>
        )}
      </button>

      {/* Children */}
      {node.type === "dir" && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              defaultExpanded={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main FileExplorer Component ──────────────────────────────────────

export default function FileExplorer({ conversationId, onFileSelect }: FileExplorerProps) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    if (!conversationId) {
      setFiles([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await api.get<{ data: FileNode[] }>(
        `/api/files/${conversationId}/list`,
      );
      setFiles(data.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "加载文件失败";
      // Don't show error for 404 - workspace might not exist yet
      if (!msg.includes("not found") && !msg.includes("404")) {
        setError(msg);
      }
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  // Fetch files when conversation changes
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // ─── Empty State ─────────────────────────────────────────────────
  if (!conversationId) {
    return (
      <div
        className="flex flex-col items-center justify-center"
        style={{ padding: "24px 0", textAlign: "center" }}
      >
        <span style={{ fontSize: "24px", marginBottom: "8px" }}>📂</span>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          选择对话查看文件
        </span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ padding: "24px 0" }}>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          加载中...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2" style={{ padding: "16px 0" }}>
        <span className="text-xs" style={{ color: "var(--red)" }}>
          {error}
        </span>
        <button
          onClick={fetchFiles}
          className="rounded px-2 py-1 text-[10px] font-medium transition-colors cursor-pointer"
          style={{
            color: "var(--accent)",
            background: "var(--accent-light)",
            border: "none",
          }}
        >
          重试
        </button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center" style={{ padding: "16px 0" }}>
        <span style={{ fontSize: "20px", marginBottom: "6px" }}>📁</span>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          暂无项目文件
        </span>
        <span
          className="text-[10px]"
          style={{ color: "var(--text-tertiary)", marginTop: "2px", opacity: 0.7 }}
        >
          Agent 产出文件后将在此处显示
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-2 py-1.5"
        style={{ borderBottom: "1px solid var(--border-light)" }}
      >
        <span className="text-[10px] font-medium" style={{ color: "var(--text-tertiary)" }}>
          {files.length} 个项目
        </span>
        <button
          onClick={fetchFiles}
          className="rounded p-1 text-[10px] transition-colors cursor-pointer"
          style={{
            color: "var(--text-tertiary)",
            background: "none",
            border: "none",
          }}
          title="刷新"
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; }}
        >
          🔄
        </button>
      </div>

      {/* File Tree */}
      <div className="overflow-y-auto" style={{ maxHeight: "400px" }}>
        {files.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            depth={0}
            onFileSelect={onFileSelect}
            defaultExpanded={true}
          />
        ))}
      </div>
    </div>
  );
}
