"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AgentCard from "@/components/AgentCard";
import CreateAgentModal from "@/components/CreateAgentModal";
import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

interface AgentItem {
  id: string;
  name: string;
  provider: string;
  avatarUrl?: string;
  model?: string | null;
  systemPrompt?: string | null;
  createdAt: string;
}

export default function AgentListPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchAgents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<AgentItem[]>("/api/contacts/list");
      setAgents(data);
    } catch {
      setError(t("agentMarket").failedToLoad);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const sortedAgents = [...agents].sort((a, b) => {
    const aIsBuiltin = a.provider === "claude" || a.provider === "opencode";
    const bIsBuiltin = b.provider === "claude" || b.provider === "opencode";
    if (aIsBuiltin && !bIsBuiltin) return -1;
    if (!aIsBuiltin && bIsBuiltin) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="relative z-10 flex min-h-screen flex-col" style={{ backgroundColor: "var(--theme-bg-primary)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--theme-border)" }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/chat")}
            className="rounded p-1.5 transition-colors"
            style={{ color: "var(--theme-text-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--theme-accent)"; e.currentTarget.style.backgroundColor = "var(--theme-accent-dim)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="font-mono text-lg font-semibold" style={{ color: "var(--theme-text-primary)" }}>
              {t("agentMarket").title}
            </h1>
            <p className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
              {t("agentMarket").subtitle}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="rounded-lg border px-4 py-2 font-mono text-xs font-bold tracking-wider transition-all active:scale-[0.98]"
          style={{
            borderColor: "var(--theme-accent)",
            color: "var(--theme-accent)",
            backgroundColor: "var(--theme-accent-dim)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--theme-accent)";
            e.currentTarget.style.color = "var(--theme-text-inverse)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--theme-accent-dim)";
            e.currentTarget.style.color = "var(--theme-accent)";
          }}
        >
          {t("agentMarket").create}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Nav tabs */}
        <div className="mb-6 flex gap-6">
          <span
            className="font-mono text-xs font-bold tracking-wider pb-1"
            style={{ color: "var(--theme-accent)", borderBottom: "2px solid var(--theme-accent)" }}
          >
            {t("agentMarket").allAgents}
          </span>
          <button
            onClick={() => router.push("/agents/contacts")}
            className="font-mono text-xs tracking-wider pb-1 transition-colors"
            style={{ color: "var(--theme-text-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--theme-text-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-text-muted)"; }}
          >
            {t("agentMarket").contacts}
          </button>
          <button
            onClick={() => router.push("/market")}
            className="font-mono text-xs tracking-wider pb-1 transition-colors"
            style={{ color: "var(--theme-text-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--theme-text-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-text-muted)"; }}
          >
            {t("agentMarket").marketTab}
          </button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex animate-pulse items-center gap-4 rounded-xl border px-5 py-4"
                style={{ borderColor: "var(--theme-border)", backgroundColor: "var(--theme-bg-surface)" }}
              >
                <div className="h-10 w-10 rounded-full" style={{ backgroundColor: "var(--theme-bg-elevated)" }} />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded" style={{ backgroundColor: "var(--theme-bg-elevated)" }} />
                  <div className="h-3 w-20 rounded" style={{ backgroundColor: "var(--theme-bg-surface)" }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <div className="flex flex-col items-center justify-center py-20">
            <div
              className="mb-4 rounded-lg border px-4 py-3 font-mono text-xs"
              style={{ borderColor: "var(--theme-danger)", backgroundColor: "rgba(255,51,85,0.1)", color: "var(--theme-danger)" }}
            >
              [{t("common").error}] {error}
            </div>
            <button
              onClick={fetchAgents}
              className="rounded-lg border px-4 py-2 font-mono text-xs tracking-wider transition-colors"
              style={{ borderColor: "var(--theme-border-light)", color: "var(--theme-text-secondary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--theme-accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--theme-border-light)"; }}
            >
              {t("common").retry}
            </button>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && sortedAgents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="mb-4 font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
              {t("agentMarket").noAgents}
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="rounded-lg border px-4 py-2 font-mono text-xs font-bold tracking-wider"
              style={{
                borderColor: "var(--theme-accent)",
                color: "var(--theme-accent)",
                backgroundColor: "var(--theme-accent-dim)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-accent)";
                e.currentTarget.style.color = "var(--theme-text-inverse)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-accent-dim)";
                e.currentTarget.style.color = "var(--theme-accent)";
              }}
            >
              {t("agentMarket").createFirst}
            </button>
          </div>
        )}

        {/* List */}
        {!isLoading && !error && sortedAgents.length > 0 && (
          <div className="space-y-2">
            {sortedAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onClick={(id) => router.push(`/agents/${id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchAgents(); }}
        />
      )}
    </div>
  );
}
