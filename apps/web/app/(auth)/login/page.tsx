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
    <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-in-up">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl hover-glow"
              style={{
                backgroundColor: "var(--theme-accent-dim)",
                border: "1px solid var(--theme-border-light)",
              }}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="var(--theme-accent)" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            </div>
            <div className="text-left">
              <h1 className="font-mono text-xl font-semibold leading-tight" style={{ color: "var(--theme-text-primary)" }}>
                {t("brand").name}
              </h1>
              <p className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                {t("brand").tagline}
              </p>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="glass-panel rounded-xl p-8">
          <h2 className="mb-2 text-center font-mono text-lg font-semibold" style={{ color: "var(--theme-text-primary)" }}>
            {t("auth").login.title}
          </h2>
          <p className="mb-6 text-center font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
            {t("auth").login.subtitle}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
                {t("auth").login.email}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth").login.emailPlaceholder}
                className="input-theme mt-1.5 block w-full rounded-lg border bg-transparent px-4 py-2.5 font-mono text-sm"
                style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
                {t("auth").login.password}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-theme mt-1.5 block w-full rounded-lg border bg-transparent px-4 py-2.5 font-mono text-sm"
                style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
                required
              />
            </div>

            {error && (
              <div
                className="rounded-lg border px-4 py-3 font-mono text-xs"
                style={{
                  borderColor: "var(--theme-danger)",
                  backgroundColor: "rgba(255,51,85,0.1)",
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
              className="btn-gradient relative w-full rounded-xl px-4 py-3 font-mono text-sm font-bold tracking-wider disabled:opacity-50"
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

          <p className="mt-6 text-center font-mono text-xs" style={{ color: "var(--theme-text-muted)" }}>
            {t("auth").login.noAccount}{" "}
            <Link href="/register" className="font-bold tracking-wider transition-colors hover-glow" style={{ color: "var(--theme-accent)" }}>
              {t("auth").login.register}
            </Link>
          </p>
        </div>

        {/* Terminal decoration + Language switch */}
        <div className="mt-4 flex items-center justify-center gap-4">
          <div className="font-mono text-xs tracking-widest" style={{ color: "var(--theme-text-muted)" }}>
            <span className="inline-block w-2 h-2 rounded-full mr-1.5 pulse-glow" style={{ backgroundColor: "var(--theme-accent)" }} />
            {t("common").systemReady}
          </div>
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
