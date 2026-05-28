"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

interface CreateAgentModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateAgentModal({ onClose, onCreated }: CreateAgentModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("gpt-4");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);
    setError(null);
    if (!name.trim()) { setValidationError(t("createAgent").nameEmpty); return; }
    if (systemPrompt.length > 4000) { setValidationError(t("createAgent").promptTooLong); return; }
    setIsSubmitting(true);
    try {
      await api.post("/api/agents/create", {
        name: name.trim(),
        provider: "custom",
        model: model || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
      });
      onCreated();
    } catch { setError(t("createAgent").creationFailed); }
    finally { setIsSubmitting(false); }
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
          {t("createAgent").title}
        </h3>
        <p className="mb-5 font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          {t("createAgent").subtitle}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
              {t("createAgent").name} <span style={{ color: "var(--theme-danger)" }}>{t("createAgent").nameRequired}</span>
            </label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t("createAgent").namePlaceholder}
              className="mt-1.5 w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-xs transition-all focus:outline-none"
              style={{ borderColor: "var(--theme-border-light)", color: "var(--theme-text-primary)" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--theme-accent)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--theme-border-light)")}
            />
          </div>

          <div>
            <label className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
              {t("createAgent").model}
            </label>
            <input type="text" value={model} onChange={(e) => setModel(e.target.value)}
              placeholder={t("createAgent").modelPlaceholder}
              className="mt-1.5 w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-xs transition-all focus:outline-none"
              style={{ borderColor: "var(--theme-border-light)", color: "var(--theme-text-primary)" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--theme-accent)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--theme-border-light)")}
            />
          </div>

          <div>
            <label className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
              {t("createAgent").systemPrompt}
            </label>
            <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
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
            <button type="button" onClick={onClose} disabled={isSubmitting}
              className="rounded-lg border px-4 py-2 font-mono text-xs tracking-wider transition-colors disabled:opacity-50"
              style={{ borderColor: "var(--theme-border-light)", color: "var(--theme-text-secondary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-accent-dim)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
              {t("createAgent").cancel}
            </button>
            <button type="submit" disabled={isSubmitting}
              className="rounded-lg border px-4 py-2 font-mono text-xs font-bold tracking-wider transition-all active:scale-[0.98] disabled:opacity-50"
              style={{ borderColor: "var(--theme-accent)", color: "var(--theme-accent)", backgroundColor: "var(--theme-accent-dim)" }}
              onMouseEnter={(e) => {
                if (!isSubmitting) { e.currentTarget.style.backgroundColor = "var(--theme-accent)"; e.currentTarget.style.color = "var(--theme-text-inverse)"; }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-accent-dim)"; e.currentTarget.style.color = "var(--theme-accent)";
              }}>
              {isSubmitting ? t("createAgent").deploying : t("createAgent").deploy}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
