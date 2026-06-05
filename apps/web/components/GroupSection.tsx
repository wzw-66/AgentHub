"use client";

import { useState } from "react";

interface GroupMember {
  id: string;
  name: string;
  avatar: string;
  color: string;
  role: string;
  silent?: boolean;
}

interface GroupSectionProps {
  members: GroupMember[];
  onRemoveMember: (memberId: string) => void;
  onAddMember: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────

export default function GroupSection({ members, onRemoveMember, onAddMember }: GroupSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  const handleRemove = (memberId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLElement;
    const memberEl = btn.closest(".member-card") as HTMLElement;
    if (memberEl) {
      memberEl.style.transition = "all 0.25s ease";
      memberEl.style.opacity = "0";
      memberEl.style.transform = "scale(0.8)";
      setTimeout(() => onRemoveMember(memberId), 250);
    }
  };

  return (
    <div className="group-section flex-shrink-0" style={{ borderBottom: "1px solid var(--border-light)" }}>
      {/* Toggle bar */}
      <div className="toggle-bar" onClick={() => setIsOpen(!isOpen)}>
        {/* Stacked avatars (max 4) */}
        <div className="flex">
          {members.slice(0, 4).map((m, i) => (
            <div
              key={m.id}
              className="flex items-center justify-center text-white font-medium"
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "50%",
                marginRight: "-6px",
                border: "1.5px solid var(--bg-app)",
                background: m.color,
                fontSize: "8px",
                zIndex: 4 - i,
              }}
            >
              {m.avatar}
            </div>
          ))}
        </div>
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          群成员 <strong style={{ color: "var(--text-primary)" }}>{members.length}</strong> 位
        </span>
        <span
          className={`arrow ${isOpen ? "open" : ""}`}
          style={{
            marginLeft: "auto",
            fontSize: "10px",
            color: "var(--text-tertiary)",
            transition: "transform 0.25s cubic-bezier(0.34,1.56,0.64,1)",
            fontFamily: "var(--font-mono)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▼
        </span>
      </div>

      {/* Expand body */}
      <div
        className="expand-body"
        style={{
          overflow: "hidden",
          maxHeight: isOpen ? "300px" : "0",
          transition: "max-height 0.35s ease, padding 0.3s ease",
          padding: isOpen ? "6px 24px 12px" : "0 24px",
        }}
      >
        <div className="flex flex-wrap" style={{ gap: "6px" }}>
          {members.map((m) => (
            <div
              key={m.id}
              className="member-card flex items-center gap-1.5"
              style={{
                padding: "4px 10px 4px 5px",
                background: "var(--bg-msg-agent)",
                border: "1px solid var(--border-light)",
                borderRadius: "20px",
                cursor: "default",
                transition: "all 0.18s ease",
                fontSize: "11px",
                color: "var(--text-secondary)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-light)";
                e.currentTarget.style.background = "var(--bg-msg-agent)";
              }}
            >
              <span
                className="flex items-center justify-center text-white font-medium flex-shrink-0"
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  background: m.color,
                  fontSize: "8px",
                }}
              >
                {m.avatar}
              </span>
              {m.name}
              <span
                className="text-xs rounded-sm"
                style={{
                  color: "var(--text-tertiary)",
                  background: "var(--bg-sidebar)",
                  padding: "1px 5px",
                  fontSize: "8px",
                  marginLeft: "2px",
                }}
              >
                {m.role}
              </span>
              {m.silent && (
                <span style={{ fontSize: "9px", color: "var(--text-tertiary)" }}>🎧</span>
              )}
              <button
                className="flex items-center justify-center flex-shrink-0 rounded-full border-none cursor-pointer transition-all"
                style={{
                  width: "14px",
                  height: "14px",
                  background: "transparent",
                  color: "transparent",
                  fontSize: "7px",
                  marginLeft: "2px",
                }}
                onClick={(e) => handleRemove(m.id, e)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--red)";
                  e.currentTarget.style.color = "#fff";
                  e.currentTarget.style.transform = "scale(1.2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "transparent";
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            className="flex items-center gap-1 transition-all cursor-pointer"
            style={{
              padding: "4px 12px 4px 8px",
              border: "1.5px dashed var(--border)",
              borderRadius: "20px",
              background: "none",
              color: "var(--text-tertiary)",
              fontSize: "11px",
              fontFamily: "var(--font-sans)",
            }}
            onClick={onAddMember}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--green)";
              e.currentTarget.style.color = "var(--green)";
              e.currentTarget.style.background = "var(--green-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-tertiary)";
              e.currentTarget.style.background = "none";
            }}
          >
            + 邀请
          </button>
        </div>
      </div>
    </div>
  );
}
