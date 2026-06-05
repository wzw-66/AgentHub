"use client";

import { useState } from "react";

interface HesitateOption {
  id: string;
  label: string;
  primary?: boolean;
}

interface HesitateBubbleProps {
  agentName: string;
  color: string;
  risks: string[];
  options: HesitateOption[];
  onSelect: (optionId: string) => void;
}

export default function HesitateBubble({
  agentName,
  color: _color,
  risks,
  options,
  onSelect,
}: HesitateBubbleProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (optionId: string) => {
    setSelectedId(optionId);
    onSelect(optionId);
  };

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #fff8e1, #fff3cd)",
        border: "1px solid rgba(184, 134, 11, 0.2)",
        borderRadius: "var(--radius-lg)",
        padding: "10px 15px",
        fontSize: "13px",
        lineHeight: 1.6,
        letterSpacing: "-0.01em",
      }}
    >
      <div
        className="flex items-center gap-1.5 mb-1"
        style={{ fontSize: "10px", fontWeight: 500 }}
      >
        <span>{agentName}</span>
        <span style={{ color: "var(--text-tertiary)", fontSize: "9px" }}>
          🤔 有点犹豫
        </span>
      </div>

      {risks.length > 0 && (
        <div style={{ marginBottom: "8px", color: "var(--text-primary)" }}>
          {risks.map((risk, i) => (
            <div key={i}>
              {i + 1}️⃣ {risk}
            </div>
          ))}
        </div>
      )}

      <div className="hesitate-options">
        {options.map((opt) => {
          const isSelected = selectedId === opt.id;
          const isPrimary = opt.primary && !selectedId;
          return (
            <button
              key={opt.id}
              className={`opt ${isSelected || isPrimary ? "primary" : ""}`}
              onClick={() => handleSelect(opt.id)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
