"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { useRipple } from "@/hooks/useRipple";

type AgentProvider = "Claude" | "OpenCode" | "Custom";

interface CreateAgentModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateAgentModal({ onClose, onCreated }: CreateAgentModalProps) {
  const { t } = useI18n();
  const [provider, setProvider] = useState<AgentProvider>("Claude");
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [customProviderName, setCustomProviderName] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { addRipple, renderRipples } = useRipple();

  const isCustom = provider === "Custom";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);
    setError(null);
    if (!name.trim()) { setValidationError(t("createAgent").nameEmpty); return; }
    if (systemPrompt.length > 4000) { setValidationError(t("createAgent").promptTooLong); return; }
    setIsSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        provider,
        systemPrompt: systemPrompt.trim() || undefined,
      };

      if (isCustom) {
        body.model = model.trim() || undefined;
        body.config = {
          providerName: customProviderName.trim() || undefined,
          apiUrl: apiUrl.trim() || undefined,
          apiKey: apiKey.trim() || undefined,
        };
      }

      await api.post("/api/contacts/create", body);
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
          {/* Provider segmented control */}
          <div>
            <label className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
              {t("createAgent").provider}
            </label>
            <div className="mt-1.5 flex rounded-lg border p-0.5" style={{ borderColor: "var(--theme-border-light)", backgroundColor: "var(--theme-bg-primary)" }}>
              {([
                { key: "Claude" as const, label: t("createAgent").claudeCode },
                { key: "OpenCode" as const, label: t("createAgent").openCode },
                { key: "Custom" as const, label: t("createAgent").custom },
              ] as const).map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setProvider(p.key)}
                  className="flex-1 rounded-md px-3 py-1.5 font-mono text-xs tracking-wider transition-all"
                  style={{
                    backgroundColor: provider === p.key ? "var(--theme-accent)" : "transparent",
                    color: provider === p.key ? "var(--theme-text-inverse)" : "var(--theme-text-secondary)",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
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

          {/* System Prompt */}
          <div>
            <label className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
              {t("createAgent").systemPrompt}
            </label>
            <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t("createAgent").systemPromptPlaceholder}
              rows={3}
              className="mt-1.5 w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-xs transition-all focus:outline-none"
              style={{ borderColor: "var(--theme-border-light)", color: "var(--theme-text-primary)" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--theme-accent)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--theme-border-light)")}
            />
          </div>

          {/* Custom provider fields */}
          {isCustom && (
            <>
              <div>
                <label className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
                  {t("createAgent").customProviderName}
                </label>
                <input type="text" value={customProviderName} onChange={(e) => setCustomProviderName(e.target.value)}
                  placeholder={t("createAgent").customProviderNamePlaceholder}
                  className="mt-1.5 w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-xs transition-all focus:outline-none"
                  style={{ borderColor: "var(--theme-border-light)", color: "var(--theme-text-primary)" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--theme-accent)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--theme-border-light)")}
                />
              </div>

              <div>
                <label className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
                  {t("createAgent").apiUrl}
                </label>
                <input type="text" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)}
                  placeholder={t("createAgent").apiUrlPlaceholder}
                  className="mt-1.5 w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-xs transition-all focus:outline-none"
                  style={{ borderColor: "var(--theme-border-light)", color: "var(--theme-text-primary)" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--theme-accent)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--theme-border-light)")}
                />
              </div>

              <div>
                <label className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
                  {t("createAgent").apiKey}
                </label>
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t("createAgent").apiKeyPlaceholder}
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
            </>
          )}

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
              onMouseDown={addRipple}
              className="rounded-lg border px-4 py-2 font-mono text-xs font-bold tracking-wider transition-all active:scale-[0.98] disabled:opacity-50"
              style={{ borderColor: "var(--theme-accent)", color: "var(--theme-accent)", backgroundColor: "var(--theme-accent-dim)", position: "relative", overflow: "hidden" }}
              onMouseEnter={(e) => {
                if (!isSubmitting) { e.currentTarget.style.backgroundColor = "var(--theme-accent)"; e.currentTarget.style.color = "var(--theme-text-inverse)"; }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-accent-dim)"; e.currentTarget.style.color = "var(--theme-accent)";
              }}>
              {renderRipples()}
              {isSubmitting ? t("createAgent").deploying : t("createAgent").deploy}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
