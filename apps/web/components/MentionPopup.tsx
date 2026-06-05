"use client";

interface MentionPopupProps {
  isOpen?: boolean;
  agents?: { id: string; name: string }[];
  selectedIndex?: number;
  onSelect?: (agentId: string) => void;
}

export default function MentionPopup({
  isOpen = false,
  agents = [],
  selectedIndex = 0,
  onSelect,
}: MentionPopupProps) {
  if (!isOpen || agents.length === 0) return null;

  return (
    <div
      className="absolute bottom-full left-0 mb-1 w-48 rounded-lg border p-1 shadow-lg"
      style={{ background: "var(--theme-bg-surface)", borderColor: "var(--theme-border)" }}
      data-testid="mention-popup"
    >
      <div className="px-2 py-1.5 text-xs font-medium" style={{ color: "var(--theme-text-dim)" }}>
        Agents
      </div>
      {agents.map((agent, i) => (
        <button
          key={agent.id}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors"
          style={{
            color: "var(--theme-text-primary)",
            background: i === selectedIndex ? "var(--theme-bg-secondary)" : "transparent",
          }}
          onClick={() => onSelect?.(agent.id)}
        >
          {agent.name}
        </button>
      ))}
    </div>
  );
}
