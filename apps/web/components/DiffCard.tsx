"use client";

interface DiffCardProps {
  content: string;
}

export default function DiffCard({ content }: DiffCardProps) {
  // Parse diff content into lines
  const lines = content.split("\n");
  const hasDiff = lines.some((l) => l.startsWith("+") || l.startsWith("-") || l.startsWith("@@"));

  if (!hasDiff) {
    return (
      <div
        className="rounded-lg border p-3 text-xs font-mono whitespace-pre-wrap"
        style={{ borderColor: "var(--border-light)", background: "var(--bg-sidebar)", color: "var(--text-secondary)" }}
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
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
        style={{ background: "var(--bg-sidebar)", color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-light)" }}
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Diff 视图
      </div>
      <div className="overflow-x-auto" style={{ background: "var(--bg-app)" }}>
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, i) => {
              if (line.startsWith("+")) {
                return (
                  <tr key={i}>
                    <td className="select-none text-right px-2 py-0.5 text-[10px] w-8" style={{ color: "var(--text-tertiary)", background: "#e6ffec", borderRight: "1px solid var(--border-light)" }}>{i + 1}</td>
                    <td className="px-3 py-0.5 whitespace-pre-wrap" style={{ background: "#e6ffec", color: "var(--text-primary)" }}>{line}</td>
                  </tr>
                );
              }
              if (line.startsWith("-")) {
                return (
                  <tr key={i}>
                    <td className="select-none text-right px-2 py-0.5 text-[10px] w-8" style={{ color: "var(--text-tertiary)", background: "#ffeef0", borderRight: "1px solid var(--border-light)" }}>{i + 1}</td>
                    <td className="px-3 py-0.5 whitespace-pre-wrap" style={{ background: "#ffeef0", color: "var(--text-primary)" }}>{line}</td>
                  </tr>
                );
              }
              return (
                <tr key={i}>
                  <td className="select-none text-right px-2 py-0.5 text-[10px] w-8" style={{ color: "var(--text-tertiary)", borderRight: "1px solid var(--border-light)" }}>{i + 1}</td>
                  <td className="px-3 py-0.5 whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{line}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
