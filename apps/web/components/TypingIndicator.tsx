"use client";

import { useChat } from "@/lib/chat-context";

export default function TypingIndicator() {
  const { typingAgents } = useChat();

  if (typingAgents.size === 0) return null;

  const names = Array.from(typingAgents.keys()).join(", ");

  return (
    <div className="flex items-center gap-2 px-4 py-1">
      <div className="flex items-center gap-1">
        <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-gray-400" />
        <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-gray-400" />
        <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-gray-400" />
      </div>
      <span className="text-xs text-gray-400">
        {names} 正在输入...
      </span>
    </div>
  );
}
