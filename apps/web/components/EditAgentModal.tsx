"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";

interface AgentData {
  id: string;
  name: string;
  provider: string;
  model?: string | null;
  avatarUrl?: string;
  systemPrompt?: string | null;
  config?: Record<string, unknown> | null;
  displayName?: string | null;
  tags?: string[];
}

interface EditAgentModalProps {
  agent: AgentData;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditAgentModal({ agent, onClose, onSaved }: EditAgentModalProps) {
  const [name, setName] = useState(agent.name);
  const [displayName, setDisplayName] = useState(agent.displayName || "");
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt || "");
  const [tags, setTags] = useState((agent.tags || []).join(", "));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      await api.patch(`/api/contacts/${agent.id}/update`, {
        name: name.trim(),
        displayName: displayName.trim() || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
        tags: tagList.length > 0 ? tagList : undefined,
      });
      onSaved();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || "保存失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ background: "rgba(0,0,0,0.3)" }} onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6 shadow-lg"
        style={{ background: "var(--bg-app)", borderColor: "var(--border)", boxShadow: "var(--shadow-md)" }}
      >
        <h2 className="mb-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>编辑 Agent</h2>
        <p className="mb-5 text-xs" style={{ color: "var(--text-tertiary)" }}>修改 Agent 配置</p>

        {error && (
          <div
            className="mb-4 rounded-lg border px-4 py-3 text-xs"
            style={{ borderColor: "rgba(201,58,58,0.2)", background: "rgba(201,58,58,0.06)", color: "var(--red)" }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-theme mt-1 block w-full rounded-lg px-3 py-2 text-sm"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>显示名称</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input-theme mt-1 block w-full rounded-lg px-3 py-2 text-sm"
              placeholder="可选"
            />
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>类型</label>
            <div
              className="mt-1 rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--border-light)",
                color: "var(--text-tertiary)",
                background: "var(--bg-sidebar)",
              }}
            >
              {agent.provider === "Custom" ? "Harness 自定义 Agent" : `本地 ${agent.provider}`}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>系统提示词</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="input-theme mt-1 block w-full rounded-lg px-3 py-2 text-sm"
              rows={3}
            />
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>标签</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="input-theme mt-1 block w-full rounded-lg px-3 py-2 text-sm"
              placeholder="逗号分隔，如：前端, 部署"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="btn-ghost rounded-lg px-4 py-2 text-xs font-medium">取消</button>
            <button type="submit" disabled={loading || !name.trim()}
              className="btn-gradient rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50">
              {loading ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
