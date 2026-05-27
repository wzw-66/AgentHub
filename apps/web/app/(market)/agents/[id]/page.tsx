"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import AgentDetailContent from "@/components/AgentDetailContent";
import { api } from "@/lib/api-client";

interface AgentData {
  id: string;
  name: string;
  provider: string;
  model?: string | null;
  avatarUrl?: string;
  systemPrompt?: string | null;
}

async function checkIsContact(agentId: string): Promise<boolean> {
  try {
    const contacts = await api.get<{ id: string; agentId: string }[]>("/api/contacts/list");
    return contacts.some((c) => c.agentId === agentId);
  } catch {
    return false;
  }
}

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [agent, setAgent] = useState<AgentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isContact, setIsContact] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchAgent = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<AgentData>(`/api/agents/${id}/detail`);
      setAgent(data);
      // Check contact status
      const contactStatus = await checkIsContact(id);
      setIsContact(contactStatus);
    } catch {
      setError("Agent 未找到");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  async function handleStartChat() {
    setActionLoading("chat");
    try {
      await api.post(
        "/api/conversations/create",
        { title: `与 ${agent!.name} 的对话`, type: "single", contactIds: [id] }
      );
      router.push(`/chat`);
    } catch {
      setActionLoading(null);
    }
  }

  async function handleAddContact() {
    setActionLoading("contact");
    try {
      await api.post("/api/contacts/create", { agentId: id });
      setIsContact(true);
    } catch {
      // Silently fail
    } finally {
      setActionLoading(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-gray-50">
        <div className="flex items-center border-b border-gray-200 bg-white px-6 py-4">
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-sm text-gray-400">加载中...</div>
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="flex min-h-screen flex-col bg-gray-50">
        <div className="flex items-center border-b border-gray-200 bg-white px-6 py-4">
          <button
            onClick={() => router.back()}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center">
          <p className="mb-4 text-sm text-red-500">{error}</p>
          <button
            onClick={() => router.push("/agents")}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            返回 Agent 列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center border-b border-gray-200 bg-white px-6 py-4">
        <button
          onClick={() => router.back()}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Agent Detail */}
      <div className="flex-1 overflow-y-auto">
        <AgentDetailContent agent={agent} />
      </div>

      {/* Actions */}
      <div className="border-t border-gray-200 bg-white px-6 py-4">
        <div className="flex gap-3">
          <button
            onClick={handleStartChat}
            disabled={actionLoading !== null}
            className="flex-1 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {actionLoading === "chat" ? "创建中..." : "开始聊天"}
          </button>
          <button
            onClick={handleAddContact}
            disabled={isContact || actionLoading !== null}
            className={`flex-1 rounded-md border px-4 py-2.5 text-sm font-medium disabled:opacity-50 ${
              isContact
                ? "border-gray-200 bg-gray-50 text-gray-400"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {actionLoading === "contact" ? "添加中..." : isContact ? "已是联系人" : "添加到联系人"}
          </button>
        </div>
      </div>
    </div>
  );
}
