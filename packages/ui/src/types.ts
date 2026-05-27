import type { ReactNode } from "react";
import type { Message, Artifact } from "@agenthub/shared";

// ─── AgentAvatar ───────────────────────────────────────────
export interface AgentAvatarProps {
  name: string;
  avatarUrl?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

// ─── MessageBubble ─────────────────────────────────────────
export interface MessageBubbleProps {
  message: Message;
  variant: "user" | "contact" | "system";
  children?: ReactNode;
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

// ─── DiffCard ──────────────────────────────────────────────
export interface DiffCardProps {
  diff: string;
  title?: string;
  className?: string;
}

// ─── PreviewCard ───────────────────────────────────────────
export interface PreviewCardProps {
  url: string;
  title?: string;
  className?: string;
}

// ─── ArtifactCard ──────────────────────────────────────────
export interface ArtifactCardProps {
  artifact: Artifact;
  className?: string;
}
