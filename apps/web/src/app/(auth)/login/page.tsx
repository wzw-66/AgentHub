"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useRipple } from "@/hooks/useRipple";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { addRipple, renderRipples } = useRipple();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push("/chat");
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      setError(apiErr.message || t("auth").login.loginFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: "var(--theme-bg-primary)" }}>
      <div className="w-full max-w-sm animate-fade-in-up">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{
                background: "var(--theme-accent)",
                borderRadius: "12px",
              }}
            >
              <span className="text-xl font-bold text-white">A</span>
            </div>
            <div className="text-left">
              <h1 className="text-xl font-semibold leading-tight" style={{ color: "var(--theme-text-primary)" }}>
                {t("brand").name}
              </h1>
              <p className="text-xs" style={{ color: "var(--theme-text-dim)" }}>
                {t("brand").tagline}
              </p>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl border p-8" style={{ background: "var(--theme-bg-surface)", borderColor: "var(--theme-border)", boxShadow: "0 4px 24px rgba(0,0,0,0.04)" }}>
          <h2 className="mb-2 text-center text-lg font-semibold" style={{ color: "var(--theme-text-primary)" }}>
            {t("auth").login.title}
          </h2>
          <p className="mb-6 text-center text-xs" style={{ color: "var(--theme-text-dim)" }}>
            {t("auth").login.subtitle}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium" style={{ color: "var(--theme-text-secondary)" }}>
                {t("auth").login.email}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth").login.emailPlaceholder}
                className="input-theme mt-1.5 block w-full rounded-lg px-4 py-2.5 text-sm"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-medium" style={{ color: "var(--theme-text-secondary)" }}>
                {t("auth").login.password}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-theme mt-1.5 block w-full rounded-lg px-4 py-2.5 text-sm"
                required
              />
            </div>

            {error && (
              <div
                className="rounded-lg border px-4 py-3 text-xs"
                style={{
                  borderColor: "rgba(244,67,54,0.2)",
                  background: "rgba(244,67,54,0.06)",
                  color: "var(--theme-danger)",
                }}
              >
                [{t("common").error}] {error}
              </div>
            )}

            <button
              type="submit"
              onMouseDown={addRipple}
              disabled={loading}
              className="btn-gradient relative w-full rounded-xl px-4 py-3 text-sm font-bold tracking-wider disabled:opacity-50"
            >
              {renderRipples()}
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t("auth").login.authenticating}
                </span>
              ) : (
                t("auth").login.authenticate
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs" style={{ color: "var(--theme-text-dim)" }}>
            {t("auth").login.noAccount}{" "}
            <Link href="/register" className="font-semibold transition-colors" style={{ color: "var(--theme-accent)" }}>
              {t("auth").login.register}
            </Link>
          </p>
        </div>

        {/* Status + Language */}
        <div className="mt-4 flex items-center justify-center gap-4">
          <div className="text-xs" style={{ color: "var(--theme-text-dim)" }}>
            <span className="inline-block mr-1.5 h-2 w-2 rounded-full" style={{ background: "var(--theme-success)" }} />
            {t("common").systemReady}
          </div>
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
