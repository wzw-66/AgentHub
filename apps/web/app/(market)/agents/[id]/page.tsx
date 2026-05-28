"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import AgentDetailContent from "@/components/AgentDetailContent";
import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

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

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const id = params.id as string;

  const [agent, setAgent] = useState<AgentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isContact, setIsContact] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchAgent = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<AgentData>(`/api/agents/${id}/detail`);
      setAgent(data);
      const contactStatus = await checkIsContact(id);
      setIsContact(contactStatus);
    } catch {
      setError(t("agentDetail").notFound);
    } finally {
      setIsLoading(false);
    }
  }, [id, t]);

  useEffect(() => { fetchAgent(); }, [fetchAgent]);

  async function handleStartChat() {
    setActionLoading("chat");
    try {
      await api.post("/api/conversations/create", {
        title: `SESSION:${agent!.name}`,
        type: "single",
        contactIds: [id],
      });
      router.push("/chat");
    } catch { setActionLoading(null); }
  }

  async function handleAddContact() {
    setActionLoading("contact");
    try {
      await api.post("/api/contacts/create", { agentId: id });
      setIsContact(true);
    } catch { /* silent */ }
    finally { setActionLoading(null); }
  }

  if (isLoading) {
    return (
      <div className="relative z-10 flex min-h-screen flex-col" style={{ backgroundColor: "var(--theme-bg-primary)" }}>
        <div className="flex items-center px-6 py-4" style={{ borderBottom: "1px solid var(--theme-border)" }}>
          <div className="h-4 w-20 rounded" style={{ backgroundColor: "var(--theme-bg-elevated)" }} />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <span className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
            {t("common").loading}
          </span>
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="relative z-10 flex min-h-screen flex-col" style={{ backgroundColor: "var(--theme-bg-primary)" }}>
        <div className="flex items-center px-6 py-4" style={{ borderBottom: "1px solid var(--theme-border)" }}>
          <button
            onClick={() => router.back()}
            className="rounded p-1.5 transition-colors"
            style={{ color: "var(--theme-text-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--theme-accent)"; e.currentTarget.style.backgroundColor = "var(--theme-accent-dim)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center">
          <div
            className="mb-4 rounded-lg border px-4 py-3 font-mono text-xs"
            style={{ borderColor: "var(--theme-danger)", backgroundColor: "rgba(255,51,85,0.1)", color: "var(--theme-danger)" }}
          >
            [{t("common").error}] {error}
          </div>
          <button
            onClick={() => router.push("/agents")}
            className="rounded-lg border px-4 py-2 font-mono text-xs tracking-wider"
            style={{ borderColor: "var(--theme-border-light)", color: "var(--theme-text-secondary)" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--theme-accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--theme-border-light)"; }}
          >
            {t("agentDetail").backToMarket}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 flex min-h-screen flex-col" style={{ backgroundColor: "var(--theme-bg-primary)" }}>
      {/* Header */}
      <div className="flex items-center px-6 py-4" style={{ borderBottom: "1px solid var(--theme-border)" }}>
        <button
          onClick={() => router.back()}
          className="rounded p-1.5 transition-colors"
          style={{ color: "var(--theme-text-muted)" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--theme-accent)"; e.currentTarget.style.backgroundColor = "var(--theme-accent-dim)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Agent Detail */}
      <div className="flex-1 overflow-y-auto">
        <AgentDetailContent agent={agent} />
      </div>

      {/* Actions */}
      <div className="px-6 py-4" style={{ borderTop: "1px solid var(--theme-border)" }}>
        <div className="flex gap-3">
          <button
            onClick={handleStartChat}
            disabled={actionLoading !== null}
            className="flex-1 rounded-lg border py-2.5 font-mono text-xs font-bold tracking-wider transition-all active:scale-[0.98] disabled:opacity-50"
            style={{
              borderColor: "var(--theme-accent)",
              color: "var(--theme-accent)",
              backgroundColor: "var(--theme-accent-dim)",
            }}
            onMouseEnter={(e) => {
              if (!actionLoading) {
                e.currentTarget.style.backgroundColor = "var(--theme-accent)";
                e.currentTarget.style.color = "var(--theme-text-inverse)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--theme-accent-dim)";
              e.currentTarget.style.color = "var(--theme-accent)";
            }}
          >
            {actionLoading === "chat" ? t("agentDetail").initializing : t("agentDetail").startChat}
          </button>
          <button
            onClick={handleAddContact}
            disabled={isContact || actionLoading !== null}
            className="flex-1 rounded-lg border py-2.5 font-mono text-xs tracking-wider transition-all disabled:opacity-40"
            style={{
              borderColor: "var(--theme-border-light)",
              color: isContact ? "var(--theme-text-muted)" : "var(--theme-text-secondary)",
            }}
            onMouseEnter={(e) => {
              if (!isContact && !actionLoading) e.currentTarget.style.borderColor = "var(--theme-accent)";
            }}
            onMouseLeave={(e) => {
              if (!isContact) e.currentTarget.style.borderColor = "var(--theme-border-light)";
            }}
          >
            {actionLoading === "contact" ? t("agentDetail").adding : isContact ? t("agentDetail").inContacts : t("agentDetail").addContact}
          </button>
        </div>
      </div>
    </div>
  );
}
