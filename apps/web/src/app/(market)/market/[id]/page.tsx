"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { AgentAvatar } from "@agenthub/ui";
import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { useRipple } from "@/hooks/useRipple";

interface PublishedAgent {
  id: string;
  name: string;
  provider: string;
  model?: string | null;
  avatarUrl?: string | null;
  description?: string | null;
  systemPrompt?: string | null;
  tags: string[];
  importCount: number;
  createdAt: string;
  creatorId: string;
  creator?: { name: string };
}

export default function MarketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const id = params.id as string;

  const [agent, setAgent] = useState<PublishedAgent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const { addRipple, renderRipples } = useRipple();

  const fetchAgent = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<PublishedAgent>(`/api/market/${id}/detail`);
      setAgent(data);
    } catch {
      setError(t("agentDetail").notFound);
    } finally {
      setIsLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  async function handleImport() {
    setImporting(true);
    setImportError(null);
    try {
      await api.post(`/api/market/${id}/import`);
      setImportDone(true);
    } catch {
      setImportError(t("agentMarket").importFailed);
    } finally {
      setImporting(false);
    }
  }

  const providerLabel = (provider: string): string => {
    const labels = t("agentInfo").providerLabels;
    return labels[provider as keyof typeof labels] || provider.toUpperCase();
  };

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
            onClick={() => router.push("/market")}
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

      {/* Detail Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col px-6 py-8">
          {/* Avatar + name */}
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl ?? undefined} size="lg" />
              <div
                className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 pulse-glow"
                style={{
                  backgroundColor: "var(--theme-accent)",
                  borderColor: "var(--theme-bg-primary)",
                }}
              />
            </div>
            <h2 className="mt-4 font-mono text-lg font-semibold" style={{ color: "var(--theme-text-primary)" }}>
              {agent.name}
            </h2>
            <span className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-accent)" }}>
              {providerLabel(agent.provider)}
            </span>
            {agent.creator?.name && (
              <span className="mt-1 font-mono text-xs" style={{ color: "var(--theme-text-muted)" }}>
                by {agent.creator.name}
              </span>
            )}
            {agent.model && (
              <span className="mt-1 font-mono text-xs" style={{ color: "var(--theme-text-muted)" }}>
                {agent.model}
              </span>
            )}
          </div>

          {/* Stats */}
          <div className="mt-6 flex justify-center gap-8">
            <div className="text-center">
              <p className="font-mono text-lg font-bold" style={{ color: "var(--theme-text-primary)" }}>
                {agent.importCount}
              </p>
              <p className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                {t("agentMarket").imports}
              </p>
            </div>
            <div className="text-center">
              <p className="font-mono text-lg font-bold" style={{ color: "var(--theme-text-primary)" }}>
                {new Date(agent.createdAt).toLocaleDateString()}
              </p>
              <p className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                {t("agentMarket").published}
              </p>
            </div>
          </div>

          {/* Tags */}
          {agent.tags.length > 0 && (
            <div className="mt-6 flex justify-center gap-2">
              {agent.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full px-3 py-1 font-mono text-xs"
                  style={{ backgroundColor: "var(--theme-accent-dim)", color: "var(--theme-accent)" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          {agent.description && (
            <div className="mt-8">
              <p className="font-mono text-xs tracking-wider mb-2" style={{ color: "var(--theme-text-muted)" }}>
                {t("agentMarket").description}
              </p>
              <div
                className="rounded-lg border p-4"
                style={{
                  borderColor: "var(--theme-border)",
                  backgroundColor: "var(--theme-bg-surface)",
                }}
              >
                <p className="font-mono text-xs leading-relaxed" style={{ color: "var(--theme-text-secondary)" }}>
                  {agent.description}
                </p>
              </div>
            </div>
          )}

          {/* System Prompt */}
          {agent.systemPrompt && (
            <div className="mt-6">
              <p className="font-mono text-xs tracking-wider mb-2" style={{ color: "var(--theme-text-muted)" }}>
                {t("agentInfo").systemPrompt}
              </p>
              <pre
                className="rounded-lg border p-4 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed"
                style={{
                  borderColor: "var(--theme-border)",
                  backgroundColor: "var(--theme-bg-code)",
                  color: "var(--theme-text-secondary)",
                  maxHeight: "300px",
                }}
              >
                {agent.systemPrompt}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Action */}
      <div className="px-6 py-4" style={{ borderTop: "1px solid var(--theme-border)" }}>
        {importDone ? (
          <div className="flex gap-3">
            <div
              className="flex-1 rounded-lg border py-2.5 text-center font-mono text-xs font-bold"
              style={{
                borderColor: "var(--theme-accent)",
                color: "var(--theme-accent)",
                backgroundColor: "var(--theme-accent-dim)",
              }}
            >
              {t("agentMarket").importSuccess}
            </div>
            <button
              onClick={() => router.push("/agents")}
              className="rounded-lg border px-5 py-2.5 font-mono text-xs font-bold tracking-wider transition-all"
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
              {t("agentMarket").viewMyAgents}
            </button>
          </div>
        ) : (
          <button
            onClick={handleImport}
            onMouseDown={addRipple}
            disabled={importing}
            className="btn-gradient w-full rounded-xl py-3 font-mono text-sm font-bold tracking-wider disabled:opacity-50"
            style={{ position: "relative", overflow: "hidden" }}
          >
            {renderRipples()}
            {importing ? t("agentMarket").importing : t("agentMarket").importAgent}
          </button>
        )}
        {importError && (
          <p className="mt-2 text-center font-mono text-xs" style={{ color: "var(--theme-danger)" }}>
            [{t("common").error}] {importError}
          </p>
        )}
      </div>
    </div>
  );
}
