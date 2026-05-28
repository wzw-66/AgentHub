"use client";

import { useChat } from "@/lib/chat-context";
import { useI18n } from "@/lib/i18n";

export default function TypingIndicator() {
  const { typingAgents } = useChat();
  const { t } = useI18n();

  if (typingAgents.size === 0) return null;

  const names = Array.from(typingAgents.keys()).join(", ");

  return (
    <div className="flex items-center gap-2 px-4 py-1.5">
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="typing-dot inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: "var(--theme-accent)" }}
          />
        ))}
      </div>
      <span className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
        {t("typing").processing(names)}
      </span>
    </div>
  );
}
