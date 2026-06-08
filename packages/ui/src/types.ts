// ─── AgentAvatar ───────────────────────────────────────────
export interface AgentAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

// ─── CodeBlock ─────────────────────────────────────────────
export interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  maxHeight?: string;
  className?: string;
}
