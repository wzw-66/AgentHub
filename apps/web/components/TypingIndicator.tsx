"use client";

interface TypingIndicatorProps {
  agents?: { name: string; color: string }[];
  label?: string;
  /** Render as an agent message bubble in the chat flow (with avatar + name tag) */
  messageStyle?: boolean;
}

export default function TypingIndicator({
  agents = [],
  label,
  messageStyle = false,
}: TypingIndicatorProps) {
  // Don't render anything if no agents are provided
  if (agents.length === 0) return null;

  const isDebate = agents.length >= 2;
  const defaultLabel = isDebate
    ? `${agents[0]!.name} 和 ${agents[1]!.name} 正在分析`
    : `正在思考`;

  // Message-style: renders like an agent message in the chat flow
  if (messageStyle) {
    const agent = agents[0]!;
    return (
      <div
        className="flex gap-2.5"
        style={{
          maxWidth: "88%",
          alignSelf: "flex-start",
          opacity: 0,
          animation: "msgIn 0.35s ease forwards",
        }}
        data-testid="typing-indicator"
      >
        {/* Agent avatar */}
        <div
          className="flex-shrink-0 flex items-center justify-center text-white font-medium"
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            background: agent.color,
            fontSize: "10px",
            marginTop: "4px",
          }}
        >
          {agent.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          {/* Agent name */}
          <div
            className="mb-1"
            style={{ fontSize: "10px", color: "var(--text-secondary)", fontWeight: 500 }}
          >
            {agent.name}
          </div>
          {/* Thinking bubble */}
          <div
            style={{
              padding: "10px 15px",
              fontSize: "13px",
              lineHeight: 1.6,
              background: "var(--bg-msg-agent)",
              color: "var(--text-primary)",
              borderRadius: "4px 16px 16px 16px",
              border: "1px solid var(--border-light)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <div className="flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="typing-dot" />
              ))}
            </div>
            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
              {label ?? defaultLabel}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Inline style (original): compact indicator bar
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
