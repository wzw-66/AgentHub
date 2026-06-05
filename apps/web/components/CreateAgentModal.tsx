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
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("Claude");
  const [displayName, setDisplayName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [tags, setTags] = useState("");
  // Custom provider only
  const [model, setModel] = useState("");
  const [apiEndpoint, setApiEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { addRipple, renderRipples } = useRipple();

  const isCustom = provider === "Custom";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const body: Record<string, unknown> = {
        name: name.trim(),
        provider,
        displayName: displayName.trim() || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
        tags: tagList.length > 0 ? tagList : undefined,
      };

      if (isCustom) {
        body.model = model.trim() || undefined;
        if (apiEndpoint.trim() || apiKey.trim()) {
          body.config = {
            apiEndpoint: apiEndpoint.trim() || undefined,
            apiKey: apiKey.trim() || undefined,
          };
        }
      }

      await api.post("/api/contacts/create", body);
      onCreated();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || "创建失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ background: "rgba(0,0,0,0.3)" }} onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6 shadow-lg max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--bg-app)", borderColor: "var(--border)", boxShadow: "var(--shadow-md)" }}
      >
        <h2 className="mb-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>创建 Agent</h2>
        <p className="mb-5 text-xs" style={{ color: "var(--text-tertiary)" }}>
          {isCustom
            ? "配置远程 API，支持后台 AgentHarness 工具调用"
            : "使用本机安装的 CLI，Agent 直接控制本地终端"}
        </p>

        {error && (
          <div
            className="mb-4 rounded-lg border px-4 py-3 text-xs"
            style={{ borderColor: "rgba(201,58,58,0.2)", background: "rgba(201,58,58,0.06)", color: "var(--red)" }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          {/* Name (required) */}
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              名称 <span style={{ color: "var(--red)" }}>*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-theme mt-1 block w-full rounded-lg px-3 py-2 text-sm"
              placeholder="例如：前端助手、后端架构师"
              required
              autoFocus
              autoComplete="off"
            />
          </div>

          {/* Display Name */}
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>显示名称</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input-theme mt-1 block w-full rounded-lg px-3 py-2 text-sm"
              placeholder="聊天中展示的名称，默认使用上面的名称"
              autoComplete="off"
            />
          </div>

          {/* Type (required) */}
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              类型 <span style={{ color: "var(--red)" }}>*</span>
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="input-theme mt-1 block w-full rounded-lg px-3 py-2 text-sm"
            >
              <option value="Claude">本地 Claude Code</option>
              <option value="OpenCode">本地 OpenCode</option>
              <option value="Custom">Harness 自定义 Agent</option>
            </select>
          </div>

          {/* System Prompt */}
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>系统提示词</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="input-theme mt-1 block w-full rounded-lg px-3 py-2 text-sm"
              rows={3}
              placeholder="例如：你是一个资深前端工程师，擅长 React 和 TypeScript..."
              autoComplete="off"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>标签</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="input-theme mt-1 block w-full rounded-lg px-3 py-2 text-sm"
              placeholder="例如：前端, 部署, 代码审查"
              autoComplete="off"
            />
          </div>

          {/* Custom agent only: Model + API config */}
          {isCustom && (
            <>
              {/* Model */}
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  模型名称
                </label>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="input-theme mt-1 block w-full rounded-lg px-3 py-2 text-sm"
                  placeholder="例如：deepseek-chat"
                  autoComplete="off"
                />
              </div>

              {/* API Base URL */}
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  API 基础地址
                </label>
                <input
                  value={apiEndpoint}
                  onChange={(e) => setApiEndpoint(e.target.value)}
                  className="input-theme mt-1 block w-full rounded-lg px-3 py-2 text-sm"
                  placeholder="例如：https://api.deepseek.com"
                  autoComplete="off"
                />
              </div>

              {/* API Key */}
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  API Key
                </label>
                <input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  type="password"
                  className="input-theme mt-1 block w-full rounded-lg px-3 py-2 text-sm"
                  placeholder="sk-..."
                  autoComplete="new-password"
                />
              </div>
            </>
          )}

          {/* CLI note */}
          {!isCustom && (
            <div
              className="rounded-lg border px-3 py-2 text-xs"
              style={{ borderColor: "var(--border-light)", color: "var(--text-tertiary)", background: "var(--bg-sidebar)" }}
            >
              {provider === "Claude"
                ? "使用本机 Claude Code CLI，无需配置模型和 API。Agent 可直接读写文件、执行命令。"
                : "使用本机 OpenCode CLI，无需配置模型和 API。Agent 可直接读写文件、执行命令。"}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost rounded-lg px-4 py-2 text-xs font-medium"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="btn-gradient rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {loading ? "创建中..." : "创建"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
