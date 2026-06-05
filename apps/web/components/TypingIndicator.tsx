"use client";

interface TypingIndicatorProps {
  agents?: { name: string; color: string }[];
  label?: string;
}

export default function TypingIndicator({
  agents = [],
  label,
}: TypingIndicatorProps) {
  // Don't render anything if no agents are provided
  if (agents.length === 0) return null;

  const isDebate = agents.length >= 2;
  const defaultLabel = isDebate
    ? `${agents[0]!.name} 和 ${agents[1]!.name} 正在分析`
    : `${agents[0]!.name} 正在输入...`;

  return (
    <div
      className="flex items-center gap-2.5"
      style={{
        padding: "0 0 0 38px",
        opacity: 0,
        animation: "msgIn 0.3s ease forwards",
      }}
      data-testid="typing-indicator"
    >
      {/* Stacked agent avatars */}
      <div className="flex">
        {agents.map((agent, i) => (
          <div
            key={i}
            className="flex items-center justify-center text-white font-medium"
            style={{
              width: "22px",
              height: "22px",
              borderRadius: "50%",
              marginRight: "-7px",
              border: "2px solid var(--bg-app)",
              background: agent.color,
              fontSize: "8px",
              zIndex: agents.length - i,
            }}
            title={agent.name}
          >
            {agent.name.charAt(0)}
          </div>
        ))}
      </div>

      {/* Animated dots */}
      <div
        className="flex items-center gap-1"
        style={{
          background: "var(--bg-msg-agent)",
          padding: "6px 14px",
          borderRadius: "12px",
        }}
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className="typing-dot" />
        ))}
      </div>

      {/* Label */}
      <span
        style={{
          fontSize: "9px",
          color: "var(--text-tertiary)",
          marginLeft: "4px",
          whiteSpace: "nowrap",
        }}
      >
        {label ?? defaultLabel}
      </span>
    </div>
  );
}
