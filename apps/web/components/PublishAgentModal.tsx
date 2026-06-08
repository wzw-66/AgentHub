"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { useRipple } from "@/hooks/useRipple";

interface PublishAgentModalProps {
  agent: {
    id: string;
    name: string;
    provider: string;
    model?: string | null;
  };
  onClose: () => void;
  onPublished: () => void;
}

export default function PublishAgentModal({ agent, onClose, onPublished }: PublishAgentModalProps) {
  const { t } = useI18n();
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { addRipple, renderRipples } = useRipple();

  const providerLabels: Record<string, string> = {
    claude: "Claude",
    opencode: "OpenCode",
    custom: "自定义",
  };
  const providerLabel = (provider: string): string => {
    return providerLabels[provider.toLowerCase()] || provider.toUpperCase();
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      await api.post("/api/market/publish", {
        contactId: agent.id,
        description: description.trim() || null,
        tags: tags.length > 0 ? tags : undefined,
      });
      onPublished();
    } catch {
      setError(t("agentMarket").publishFailed);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
    >
      <div
        className="w-full max-w-md rounded-xl p-6 shadow-2xl animate-fade-in-up"
        style={{
          backgroundColor: "var(--theme-bg-elevated)",
          border: "1px solid var(--theme-border)",
        }}
      >
        <h3 className="mb-1 font-mono text-base font-semibold" style={{ color: "var(--theme-text-primary)" }}>
          {t("agentMarket").publishTitle}
        </h3>
        <p className="mb-5 font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          {t("agentMarket").publishSubtitle}
        </p>

        {/* Preview */}
        <div
          className="mb-5 rounded-lg border p-4"
          style={{ borderColor: "var(--theme-border)", backgroundColor: "var(--theme-bg-surface)" }}
        >
          <p className="font-mono text-sm font-semibold" style={{ color: "var(--theme-text-primary)" }}>
            {agent.name}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-accent)" }}>
              {providerLabel(agent.provider)}
            </span>
            {agent.model && (
              <>
                <span style={{ color: "var(--theme-text-muted)" }}>·</span>
                <span className="font-mono text-xs" style={{ color: "var(--theme-text-muted)" }}>
                  {agent.model}
                </span>
              </>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Description */}
          <div>
            <label className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
              {t("agentMarket").description} <span style={{ color: "var(--theme-text-muted)" }}>({t("agentMarket").optional})</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("agentMarket").descriptionPlaceholder}
              rows={3}
              className="mt-1.5 w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-xs transition-all focus:outline-none"
              style={{ borderColor: "var(--theme-border-light)", color: "var(--theme-text-primary)" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--theme-accent)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--theme-border-light)")}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
              {t("agentMarket").tags} <span style={{ color: "var(--theme-text-muted)" }}>({t("agentMarket").optional})</span>
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder={t("agentMarket").tagsPlaceholder}
              className="mt-1.5 w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-xs transition-all focus:outline-none"
              style={{ borderColor: "var(--theme-border-light)", color: "var(--theme-text-primary)" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--theme-accent)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--theme-border-light)")}
            />
          </div>

          {error && (
            <p className="font-mono text-xs" style={{ color: "var(--theme-danger)" }}>
              [{t("common").error}] {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border px-4 py-2 font-mono text-xs tracking-wider transition-colors disabled:opacity-50"
              style={{ borderColor: "var(--theme-border-light)", color: "var(--theme-text-secondary)" }}
            >
              {t("common").cancel}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              onMouseDown={addRipple}
              className="rounded-lg border px-4 py-2 font-mono text-xs font-bold tracking-wider transition-all active:scale-[0.98] disabled:opacity-50"
              style={{
                borderColor: "var(--theme-accent)",
                color: "var(--theme-accent)",
                backgroundColor: "var(--theme-accent-dim)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {renderRipples()}
              {isSubmitting ? t("agentMarket").publishing : t("agentMarket").publish}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
