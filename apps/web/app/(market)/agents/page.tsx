"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AgentCard from "@/components/AgentCard";
import CreateAgentModal from "@/components/CreateAgentModal";
import { api } from "@/lib/api-client";

interface AgentItem {
  id: string;
  name: string;
  provider: string;
  avatarUrl?: string;
  model?: string | null;
  systemPrompt?: string | null;
  createdAt: string;
}

export default function AgentListPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchAgents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<AgentItem[]>("/api/agents/list");
      setAgents(data);
    } catch {
      setError("加载 Agent 列表失败，请重试");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Sort: built-in agents (created early, typically Claude/OpenCode) first
  const sortedAgents = [...agents].sort((a, b) => {
    const aIsBuiltin = a.provider === "claude" || a.provider === "opencode";
    const bIsBuiltin = b.provider === "claude" || b.provider === "opencode";
    if (aIsBuiltin && !bIsBuiltin) return -1;
    if (!aIsBuiltin && bIsBuiltin) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/chat")}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Agent 市场</h1>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          创建 Agent
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Navigation Tabs */}
        <div className="mb-4 flex gap-4 text-sm">
          <span className="font-medium text-blue-600 border-b-2 border-blue-600 pb-1">
            全部 Agent
          </span>
          <button
            onClick={() => router.push("/agents/contacts")}
            className="text-gray-500 hover:text-gray-700 pb-1"
          >
            我的联系人
          </button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex animate-pulse items-center gap-4 rounded-lg border border-gray-200 bg-white px-5 py-4"
              >
                <div className="h-10 w-10 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-gray-200" />
                  <div className="h-3 w-20 rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="mb-4 text-sm text-red-500">{error}</p>
            <button
              onClick={fetchAgents}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              重试
            </button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && sortedAgents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="mb-4 text-sm text-gray-500">暂无可用 Agent</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              创建第一个 Agent
            </button>
          </div>
        )}

        {/* Agent List */}
        {!isLoading && !error && sortedAgents.length > 0 && (
          <div className="space-y-3">
            {sortedAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onClick={(id) => router.push(`/agents/${id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Agent Modal */}
      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            fetchAgents();
          }}
        />
      )}
    </div>
  );
}
