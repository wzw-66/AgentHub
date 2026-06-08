"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";

interface ArtifactPreviewModalProps {
  artifactId: string;
  title?: string;
  onClose: () => void;
}

interface PreviewData {
  id: string;
  content: string | null;
  previewUrl: string | null;
  type: string;
}

export default function ArtifactPreviewModal({
  artifactId,
  title,
  onClose,
}: ArtifactPreviewModalProps) {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<PreviewData>(`/api/artifacts/${artifactId}/preview`)
      .then((data) => {
        if (!cancelled) {
          setPreviewData(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load preview");
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [artifactId]);

  const iframeContent =
    previewData?.previewUrl
      ? previewData.previewUrl
      : previewData?.content ?? "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.8)" }}
      onClick={onClose}
    >
      <div
        className="flex h-[90vh] w-[90vw] flex-col overflow-hidden rounded-xl shadow-2xl"
        style={{ backgroundColor: "var(--bg-app)", border: "1px solid var(--border-light)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--border-light)" }}
        >
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {title || "Artifact Preview"}
          </span>
          <button
            onClick={onClose}
            className="rounded p-1.5 transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-tertiary)" }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Loading preview...
              </span>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <span className="text-xs" style={{ color: "var(--red)" }}>
                {error}
              </span>
            </div>
          ) : previewData?.type === "html" || previewData?.previewUrl ? (
            <iframe
              className="h-full w-full border-0"
              srcDoc={!previewData?.previewUrl ? iframeContent : undefined}
              src={previewData?.previewUrl ?? undefined}
              title="Artifact Preview"
              sandbox="allow-scripts"
              style={{ backgroundColor: "#fff" }}
            />
          ) : (
            <div className="h-full overflow-auto p-6">
              <pre
                className="whitespace-pre-wrap font-mono text-sm leading-relaxed"
                style={{ color: "var(--text-primary)" }}
              >
                {previewData?.content ?? "No content"}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
