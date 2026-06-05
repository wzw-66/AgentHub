"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import AgentDetailContent from "@/components/AgentDetailContent";
import EditAgentModal from "@/components/EditAgentModal";
import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { useRipple } from "@/hooks/useRipple";

interface AgentData {
  id: string;
  name: string;
  provider: string;
  model?: string | null;
  avatarUrl?: string;
  systemPrompt?: string | null;
  config?: Record<string, unknown> | null;
}

async function checkIsContact(contactId: string): Promise<boolean> {
  try {
    await api.get(`/api/contacts/${contactId}/detail`);
    return true;
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const { addRipple: addRippleChat, renderRipples: renderRipplesChat } = useRipple();

  const fetchAgent = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<AgentData>(`/api/contacts/${id}/detail`);
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
      const existing = await api.get<{ conversation: { id: string } | null }>(
        `/api/conversations/find-by-agent/${id}`,
      );
      if (existing.conversation) {
        router.push("/chat");
        return;
      }

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

  async function handleDelete() {
    setActionLoading("delete");
    try {
      await api.delete(`/api/contacts/${id}/delete`);
      router.push("/agents");
    } catch { /* silent */ }
    finally { setActionLoading(null); setDeleteConfirm(false); }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col" style={{ backgroundColor: "var(--theme-bg-primary)" }}>
        <div className="flex items-center px-6 py-4" style={{ borderBottom: "1px solid var(--theme-border)" }}>
          <div className="h-4 w-20 rounded" style={{ backgroundColor: "var(--theme-bg-elevated)" }} />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <span className="text-xs" style={{ color: "var(--theme-text-dim)" }}>
            {t("common").loading}
          </span>
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="flex min-h-screen flex-col" style={{ backgroundColor: "var(--theme-bg-primary)" }}>
        <div className="flex items-center px-6 py-4" style={{ borderBottom: "1px solid var(--theme-border)" }}>
          <button
            onClick={() => router.back()}
            className="rounded p-1.5 transition-colors hover:bg-[var(--theme-bg-secondary)]"
            style={{ color: "var(--theme-text-dim)" }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center">
          <div
            className="mb-4 rounded-lg border px-4 py-3 text-xs"
            style={{ borderColor: "rgba(244,67,54,0.2)", backgroundColor: "rgba(244,67,54,0.06)", color: "var(--theme-danger)" }}
          >
            [{t("common").error}] {error}
          </div>
          <button
            onClick={() => router.push("/agents")}
            className="btn-ghost rounded-lg px-4 py-2 text-xs"
          >
            {t("agentDetail").backToMarket}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "var(--theme-bg-primary)" }}>
      {/* Header */}
      <div className="flex items-center px-6 py-4" style={{ borderBottom: "1px solid var(--theme-border)" }}>
        <button
          onClick={() => router.back()}
          className="rounded p-1.5 transition-colors hover:bg-[var(--theme-bg-secondary)]"
          style={{ color: "var(--theme-text-dim)" }}
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
            onClick={() => setShowEditModal(true)}
            disabled={actionLoading !== null}
            className="btn-ghost flex-1 rounded-lg py-2.5 text-xs font-medium disabled:opacity-40"
          >
            {t("agentDetail").edit}
          </button>
          <button
            onClick={handleStartChat}
            onMouseDown={addRippleChat}
            disabled={actionLoading !== null}
            className="btn-gradient relative flex-1 rounded-lg py-2.5 text-xs font-semibold disabled:opacity-50"
            style={{ overflow: "hidden" }}
          >
            {renderRipplesChat()}
            {actionLoading === "chat" ? t("agentDetail").initializing : t("agentDetail").startChat}
          </button>
          <button
            onClick={handleAddContact}
            disabled={isContact || actionLoading !== null}
            className="btn-ghost flex-1 rounded-lg py-2.5 text-xs font-medium disabled:opacity-40"
          >
            {actionLoading === "contact" ? t("agentDetail").adding : isContact ? t("agentDetail").inContacts : t("agentDetail").addContact}
          </button>

          {deleteConfirm ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDelete}
                disabled={actionLoading === "delete"}
                className="rounded-lg px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--theme-danger)" }}
              >
                {actionLoading === "delete" ? "..." : t("agentDetail").confirmDelete}
              </button>
              <button
                onClick={() => setDeleteConfirm(false)}
                className="rounded-lg px-3 py-2.5 text-xs"
                style={{ color: "var(--theme-text-dim)" }}
              >
                {t("common").cancel}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setDeleteConfirm(true)}
              disabled={actionLoading !== null}
              className="flex-1 rounded-lg border py-2.5 text-xs font-medium transition-colors disabled:opacity-40"
              style={{
                borderColor: "var(--theme-danger)",
                color: "var(--theme-danger)",
              }}
            >
              {t("agentDetail").delete}
            </button>
          )}
        </div>
      </div>

      {showEditModal && agent && (
        <EditAgentModal
          agent={agent}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false);
            fetchAgent();
          }}
        />
      )}
    </div>
  );
}
