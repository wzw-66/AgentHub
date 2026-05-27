"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@/lib/chat-context";

interface MentionPopupProps {
  searchQuery: string;
  selectedIndex: number;
  onSelect: (agentName: string) => void;
  onHover: (index: number) => void;
}

export default function MentionPopup({
  searchQuery,
  selectedIndex,
  onSelect,
  onHover,
}: MentionPopupProps) {
  const { agents } = useChat();
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = searchQuery
    ? agents.filter((a) =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : agents;

  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as
      | HTMLElement
      | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 z-50 mb-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg">
      <div ref={listRef} className="max-h-48 overflow-y-auto py-1">
        {filtered.map((agent, index) => (
          <button
            key={agent.id}
            onClick={() => onSelect(agent.name)}
            onMouseEnter={() => onHover(index)}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
              index === selectedIndex
                ? "bg-blue-50 text-blue-700"
                : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-300 text-[10px] text-gray-600">
              {agent.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-medium">{agent.name}</span>
              <span className="ml-2 text-xs text-gray-400">
                {agent.provider}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
