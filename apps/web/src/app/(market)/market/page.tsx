"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import MarketAgentCard from "@/components/MarketAgentCard";
import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

interface MarketAgent {
  id: string;
  name: string;
  provider: string;
  avatarUrl?: string | null;
  model?: string | null;
  description?: string | null;
  tags: string[];
  importCount: number;
  createdAt: string;
  creator?: { name: string };
}

const PROVIDER_FILTERS = ["All", "Claude", "OpenCode", "Custom"] as const;

export default function MarketBrowsePage() {
  const router = useRouter();
  const { t } = useI18n();
  const [agents, setAgents] = useState<MarketAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeProvider, setActiveProvider] = useState<string>("All");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchMarket = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (activeProvider !== "All") params.set("provider", activeProvider);

      const queryString = params.toString();
      const data = await api.get<MarketAgent[]>(
        `/api/market/list${queryString ? `?${queryString}` : ""}`
      );
      setAgents(data);
    } catch {
      setError(t("agentMarket").failedToLoad);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedQuery, activeProvider, t]);

  useEffect(() => {
    fetchMarket();
  }, [fetchMarket]);

  return (
    <div className="relative z-10 flex min-h-screen flex-col" style={{ backgroundColor: "var(--theme-bg-primary)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--theme-border)" }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/agents")}
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
              {t("agentMarket").marketTitle}
            </h1>
            <p className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
              {t("agentMarket").marketSubtitle}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Search + Filters */}
        <div className="mb-6 space-y-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("agentMarket").searchMarket}
            className="w-full rounded-xl border bg-transparent px-3.5 py-2 font-mono text-xs tracking-wider"
            style={{ borderColor: "var(--theme-border)", color: "var(--theme-text-primary)" }}
          />
          <div className="flex gap-2">
            {PROVIDER_FILTERS.map((provider) => (
              <button
                key={provider}
                onClick={() => setActiveProvider(provider)}
                className="rounded-lg px-3 py-1.5 font-mono text-xs tracking-wider transition-all"
                style={{
                  backgroundColor: activeProvider === provider ? "var(--theme-accent)" : "transparent",
                  color: activeProvider === provider ? "var(--theme-text-inverse)" : "var(--theme-text-muted)",
                  border: activeProvider === provider ? "none" : "1px solid var(--theme-border-light)",
                }}
              >
                {provider === "All" ? t("agentMarket").allProviders : provider.toUpperCase()}
              </button>
            ))}
          </div>
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
                  <div className="h-3 w-48 rounded" style={{ backgroundColor: "var(--theme-bg-surface)" }} />
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
              onClick={fetchMarket}
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
        {!isLoading && !error && agents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="mb-4 font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
              {searchQuery || activeProvider !== "All"
                ? t("agentMarket").noMatch
                : t("agentMarket").marketEmpty}
            </p>
            {!searchQuery && activeProvider === "All" && (
              <button
                onClick={() => router.push("/agents")}
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
                {t("agentMarket").goToMyAgents}
              </button>
            )}
          </div>
        )}

        {/* List */}
        {!isLoading && !error && agents.length > 0 && (
          <div className="space-y-2">
            {agents.map((agent) => (
              <MarketAgentCard
                key={agent.id}
                agent={agent}
                onClick={(id) => router.push(`/market/${id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
