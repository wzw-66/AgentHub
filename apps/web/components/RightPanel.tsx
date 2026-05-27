"use client";

interface RightPanelProps {
  content: {
    type: "artifact" | "agent";
    id: string;
  } | null;
  onClose: () => void;
}

export default function RightPanel({ content, onClose }: RightPanelProps) {
  if (!content) return null;

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <span className="text-sm font-medium text-gray-900">
          {content.type === "artifact" ? "产物预览" : "Agent 详情"}
        </span>
        <button
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-sm text-gray-400">
          {content.type === "artifact"
            ? "选择产物查看预览"
            : "选择 Agent 查看详情"}
        </p>
      </div>
    </div>
  );
}
