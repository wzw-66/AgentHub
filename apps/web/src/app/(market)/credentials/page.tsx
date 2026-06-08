"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

interface Credential {
  id: string;
  provider: string;
  encryptedKey: string;
  createdAt: string;
}

export default function CredentialListPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProvider, setNewProvider] = useState("");
  const [newKey, setNewKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCredentials = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<Credential[]>("/api/credentials/list");
      setCredentials(data);
    } catch {
      setError(t("agentMarket").failedToLoad);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  async function handleAddCredential(e: React.FormEvent) {
    e.preventDefault();
    if (!newProvider.trim() || !newKey.trim()) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await api.post("/api/credentials/create", {
        provider: newProvider.trim(),
        encryptedKey: newKey.trim(),
      });
      setShowAddForm(false);
      setNewProvider("");
      setNewKey("");
      await fetchCredentials();
    } catch {
      setSubmitError("添加失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await api.delete(`/api/credentials/${id}/delete`);
      setCredentials((prev) => prev.filter((c) => c.id !== id));
      setDeleteConfirmId(null);
    } catch {
      // silent
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="relative z-10 flex min-h-screen flex-col"
      style={{ backgroundColor: "var(--theme-bg-primary)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid var(--theme-border)" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/agents")}
            className="rounded p-1.5 transition-colors"
            style={{ color: "var(--theme-text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--theme-accent)";
              e.currentTarget.style.backgroundColor = "var(--theme-accent-dim)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--theme-text-muted)";
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="font-mono text-lg font-semibold" style={{ color: "var(--theme-text-primary)" }}>
              凭据管理
            </h1>
            <p className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
              管理 API Key 和 Provider 凭据
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setShowAddForm(true);
            setSubmitError(null);
          }}
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
          + 添加凭据
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
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
              onClick={fetchCredentials}
              className="rounded-lg border px-4 py-2 font-mono text-xs tracking-wider transition-colors"
              style={{ borderColor: "var(--theme-border-light)", color: "var(--theme-text-secondary)" }}
            >
              {t("common").retry}
            </button>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && credentials.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="mb-4 font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
              还没有凭据，点击上方按钮添加
            </p>
          </div>
        )}

        {/* Credential List */}
        {!isLoading && !error && credentials.length > 0 && (
          <div className="space-y-2">
            {credentials.map((cred) => (
              <div
                key={cred.id}
                className="flex items-center justify-between rounded-xl border px-5 py-4 transition-colors"
                style={{ borderColor: "var(--theme-border)", backgroundColor: "var(--theme-bg-surface)" }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full font-mono text-sm font-bold"
                    style={{
                      backgroundColor: "var(--theme-accent-dim)",
                      color: "var(--theme-accent)",
                    }}
                  >
                    {cred.provider[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div>
                    <p className="font-mono text-sm font-semibold" style={{ color: "var(--theme-text-primary)" }}>
                      {cred.provider}
                    </p>
                    <p className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                      {cred.encryptedKey}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px]" style={{ color: "var(--theme-text-dim)" }}>
                    {new Date(cred.createdAt).toLocaleDateString()}
                  </span>
                  {deleteConfirmId === cred.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDelete(cred.id)}
                        disabled={deleting}
                        className="rounded-lg px-3 py-1.5 font-mono text-xs font-semibold text-white disabled:opacity-50"
                        style={{ backgroundColor: "var(--theme-danger)" }}
                      >
                        {deleting ? "..." : "确认删除"}
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="rounded-lg px-3 py-1.5 font-mono text-xs"
                        style={{ color: "var(--theme-text-dim)" }}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(cred.id)}
                      className="rounded-lg px-3 py-1.5 font-mono text-xs font-medium transition-colors"
                      style={{
                        border: "1px solid var(--theme-danger)",
                        color: "var(--theme-danger)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "rgba(255,51,85,0.08)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Credential Modal */}
      {showAddForm && (
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
              添加凭据
            </h3>
            <p className="mb-5 font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
              添加 API Provider 的凭据信息
            </p>

            <form onSubmit={handleAddCredential} className="space-y-4">
              {/* Provider */}
              <div>
                <label className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
                  Provider 名称
                </label>
                <input
                  type="text"
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value)}
                  placeholder="例如: openai, anthropic"
                  className="mt-1.5 w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-xs transition-all focus:outline-none"
                  style={{ borderColor: "var(--theme-border-light)", color: "var(--theme-text-primary)" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--theme-accent)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--theme-border-light)")}
                  required
                />
              </div>

              {/* API Key */}
              <div>
                <label className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
                  API Key
                </label>
                <input
                  type="password"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="sk-..."
                  className="mt-1.5 w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-xs transition-all focus:outline-none"
                  style={{ borderColor: "var(--theme-border-light)", color: "var(--theme-text-primary)" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--theme-accent)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--theme-border-light)")}
                  required
                />
              </div>

              {submitError && (
                <p className="font-mono text-xs" style={{ color: "var(--theme-danger)" }}>
                  {submitError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setSubmitError(null);
                  }}
                  disabled={isSubmitting}
                  className="rounded-lg border px-4 py-2 font-mono text-xs tracking-wider transition-colors disabled:opacity-50"
                  style={{ borderColor: "var(--theme-border-light)", color: "var(--theme-text-secondary)" }}
                >
                  {t("common").cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newProvider.trim() || !newKey.trim()}
                  className="rounded-lg border px-4 py-2 font-mono text-xs font-bold tracking-wider transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{
                    borderColor: "var(--theme-accent)",
                    color: "var(--theme-text-inverse)",
                    backgroundColor: "var(--theme-accent)",
                  }}
                >
                  {isSubmitting ? "保存中..." : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
