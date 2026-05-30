"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@/lib/chat-context";

interface MentionPopupProps {
  searchQuery: string;
  selectedIndex: number;
  onSelect: (contactName: string) => void;
  onHover: (index: number) => void;
}

export default function MentionPopup({
  searchQuery,
  selectedIndex,
  onSelect,
  onHover,
}: MentionPopupProps) {
  const { contacts } = useChat();
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = searchQuery
    ? (contacts || []).filter((a) => a.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : (contacts || []);

  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (filtered.length === 0) return null;

  return (
    <div
      className="absolute bottom-full left-0 z-50 mb-1 w-64 rounded-lg shadow-xl overflow-hidden"
      style={{
        backgroundColor: "var(--theme-bg-elevated)",
        border: "1px solid var(--theme-border)",
      }}
    >
      <div ref={listRef} className="max-h-48 overflow-y-auto py-1">
        {filtered.map((contact, index) => (
          <button
            key={contact.id}
            onClick={() => onSelect(contact.name)}
            onMouseEnter={() => onHover(index)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors"
            style={{
              backgroundColor: index === selectedIndex ? "var(--theme-accent-dim)" : "transparent",
              color: index === selectedIndex ? "var(--theme-accent)" : "var(--theme-text-primary)",
            }}
          >
            <div
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[8px] font-mono font-bold"
              style={{
                backgroundColor: "var(--theme-accent-dim)",
                color: "var(--theme-accent)",
              }}
            >
              {contact.name.charAt(0).toUpperCase()}
            </div>
            <span className="flex-1 min-w-0 font-mono text-xs">
              {contact.name}
            </span>
            <span className="font-mono text-xs flex-shrink-0" style={{ color: "var(--theme-text-dim)" }}>
              {contact.provider}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
