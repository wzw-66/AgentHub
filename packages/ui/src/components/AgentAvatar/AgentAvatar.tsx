import type { AgentAvatarProps } from "../../types.js";

const AVATAR_COLORS = [
  "#60a5fa", // brighter blue
  "#a78bfa", // brighter purple
  "#f472b6", // brighter pink
  "#fb7185", // brighter red
  "#fb923c", // brighter orange
  "#fbbf24", // amber
  "#34d399", // emerald
  "#22d3ee", // cyan
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

const SIZE_MAP: Record<string, number> = {
  sm: 32,
  md: 40,
  lg: 48,
};

export function AgentAvatar({
  name,
  avatarUrl,
  size = "md",
  className = "",
}: AgentAvatarProps) {
  const px = SIZE_MAP[size] ?? 40;
  const colorIndex = hashName(name) % AVATAR_COLORS.length;
  const bgColor = AVATAR_COLORS[colorIndex];
  const initial = name.charAt(0).toUpperCase();

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={className}
        style={{
          width: px,
          height: px,
          borderRadius: "50%",
          objectFit: "cover",
        }}
        data-testid="agent-avatar-img"
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        width: px,
        height: px,
        borderRadius: "50%",
        backgroundColor: bgColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#000000",
        fontWeight: 700,
        fontSize: px * 0.4,
        lineHeight: 1,
        userSelect: "none",
        flexShrink: 0,
        border: "1px solid rgba(0,0,0,0.1)",
      }}
      data-testid="agent-avatar-initials"
    >
      {initial}
    </div>
  );
}
