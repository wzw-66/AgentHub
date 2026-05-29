"use client";

import { useState, useEffect } from "react";
import AgentDetailContent from "./AgentDetailContent";
import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { useRipple } from "@/hooks/useRipple";

interface RightPanelProps {
  content: { type: "artifact" | "agent"; id: string } | null;
  onClose: () => void;
}

interface AgentData {
  id: string;
  name: string;
  provider: string;
  model?: string | null;
  avatarUrl?: string;
  systemPrompt?: string | null;
}

async function checkIsContact(agentId: string): Promise<boolean> {
  try {
    const contacts = await api.get<{ id: string; agentId: string }[]>("/api/contacts/list");
    return contacts.some((c) => c.agentId === agentId);
  } catch { return false; }
}

async function startChat(agentId: string): Promise<void> {
  await api.post("/api/conversations/create", {
    title: "New Session",
    type: "single",
    contactIds: [agentId],
  });
}

async function addContact(agentId: string): Promise<void> {
  await api.post("/api/contacts/create", { agentId });
}

export default function RightPanel({ content, onClose }: RightPanelProps) {
  const { t } = useI18n();
  const { addRipple, renderRipples } = useRipple();
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [isContact, setIsContact] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (content?.type === "agent") {
      setIsLoading(true);
      api.get<AgentData>(`/api/agents/${content.id}/detail`)
        .then(async (data) => {
          setAgent(data);
          const contactStatus = await checkIsContact(content.id);
          setIsContact(contactStatus);
        })
        .catch(() => setAgent(null))
        .finally(() => setIsLoading(false));
    } else {
      setAgent(null);
    }
  }, [content]);

  if (!content) return null;

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: "var(--theme-bg-glass-panel)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--theme-border)" }}>
        <span className="font-mono text-xs font-bold tracking-wider" style={{ color: "var(--theme-text-primary)" }}>
          {content.type === "artifact" ? t("rightPanel").artifactView : t("rightPanel").agentInfo}
        </span>
        <button
          onClick={onClose}
          className="btn-ghost rounded p-1"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      {content.type === "artifact" ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
            {t("rightPanel").selectArtifact}
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
            {t("common").loading}
          </span>
        </div>
      ) : !agent ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
            {t("rightPanel").selectAgent}
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-y-auto">
          <AgentDetailContent agent={agent} />

          {/* Actions */}
          <div className="px-4 py-3" style={{ borderTop: "1px solid var(--theme-border)" }}>
            <div className="flex gap-2">
              <button
                onClick={() => startChat(agent.id)}
                onMouseDown={addRipple}
                className="btn-gradient flex-1 rounded-xl py-2.5 font-mono text-xs font-bold tracking-wider"
              >
                {renderRipples()}
                {t("rightPanel").startChat}
              </button>
              <button
                onClick={async () => { await addContact(agent.id); setIsContact(true); }}
                disabled={isContact}
                className="btn-ghost flex-1 rounded-lg border py-2 font-mono text-xs tracking-wider disabled:opacity-40"
                style={{
                  borderColor: "var(--theme-border-light)",
                  color: isContact ? "var(--theme-text-muted)" : "var(--theme-text-secondary)",
                }}
              >
                {isContact ? t("rightPanel").inContacts : t("rightPanel").addContact}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
