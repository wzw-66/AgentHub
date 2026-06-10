"use client";

// ─── Props ──────────────────────────────────────────────────────────────

interface ExpandPreviewModalProps {
  /** Raw HTML content to render in the iframe */
  content: string;
  title?: string;
  onClose: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────

/**
 * Full-screen modal that renders raw HTML content in an iframe.
 * Used for expanding inline web_preview artifacts to full screen.
 */
export default function ExpandPreviewModal({
  content,
  title,
  onClose,
}: ExpandPreviewModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.8)" }}
      onClick={onClose}
    >
      <div
        className="flex h-[90vh] w-[90vw] flex-col overflow-hidden rounded-xl shadow-2xl"
        style={{
          backgroundColor: "var(--bg-app)",
          border: "1px solid var(--border-light)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--border-light)" }}
        >
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="var(--accent)"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {title || "预览"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer" }}
          >
            <svg
              className="h-4 w-4"
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
          </button>
        </div>

        {/* Fullscreen iframe */}
        <div className="flex-1 overflow-hidden">
          <iframe
            className="h-full w-full border-0"
            srcDoc={content}
            title={title || "Preview"}
            sandbox="allow-scripts"
            style={{ backgroundColor: "#fff" }}
          />
        </div>
      </div>
    </div>
  );
}
