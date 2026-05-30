"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { useRipple } from "@/hooks/useRipple";

interface EditAgentModalProps {
  agent: {
    id: string;
    name: string;
    provider: string;
    model?: string | null;
    systemPrompt?: string | null;
  };
  onClose: () => void;
  onSaved: () => void;
}

export default function EditAgentModal({ agent, onClose, onSaved }: EditAgentModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState(agent.name);
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { addRipple, renderRipples } = useRipple();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);
    setError(null);

    if (!name.trim()) {
      setValidationError(t("agentDetail").editModal.nameEmpty);
      return;
    }

    setIsSubmitting(true);
    try {
      await api.patch(`/api/contacts/${agent.id}/update`, {
        name: name.trim(),
        systemPrompt: systemPrompt.trim() || null,
      });
      onSaved();
    } catch {
      setError(t("agentDetail").editModal.saveFailed);
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
          {t("agentDetail").editModal.title}
        </h3>
        <p className="mb-5 font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          {t("agentDetail").editModal.subtitle}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Provider (read-only) */}
          <div>
            <label className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
              {t("agentDetail").editModal.providerReadonly}
            </label>
            <div
              className="mt-1.5 w-full rounded-lg border px-3 py-2 font-mono text-xs"
              style={{
                borderColor: "var(--theme-border-light)",
                color: "var(--theme-text-muted)",
                backgroundColor: "var(--theme-bg-primary)",
              }}
            >
              {agent.provider}{agent.model ? ` / ${agent.model}` : ""}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
              {t("createAgent").name} <span style={{ color: "var(--theme-danger)" }}>{t("createAgent").nameRequired}</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-xs transition-all focus:outline-none"
              style={{ borderColor: "var(--theme-border-light)", color: "var(--theme-text-primary)" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--theme-accent)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--theme-border-light)")}
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
              {t("createAgent").systemPrompt}
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t("createAgent").systemPromptPlaceholder}
              rows={4}
              className="mt-1.5 w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-xs transition-all focus:outline-none"
              style={{ borderColor: "var(--theme-border-light)", color: "var(--theme-text-primary)" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--theme-accent)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--theme-border-light)")}
            />
          </div>

          {/* Validation Error */}
          {validationError && (
            <p className="font-mono text-xs" style={{ color: "var(--theme-danger)" }}>
              [{t("createAgent").validation}] {validationError}
            </p>
          )}
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
              {t("createAgent").cancel}
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
              {isSubmitting ? t("agentDetail").saving : t("agentDetail").editModal.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
