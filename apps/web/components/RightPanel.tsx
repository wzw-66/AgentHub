"use client";

import { useState, useEffect } from "react";
import AgentDetailContent from "./AgentDetailContent";
import { api } from "@/lib/api-client";

interface RightPanelProps {
  content: {
    type: "artifact" | "agent";
    id: string;
  } | null;
  onClose: () => void;
}

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

async function startChat(agentId: string): Promise<void> {
  await api.post("/api/conversations/create", {
    title: "新对话",
    type: "single",
    contactIds: [agentId],
  });
}

async function addContact(agentId: string): Promise<void> {
  await api.post("/api/contacts/create", { agentId });
}

export default function RightPanel({ content, onClose }: RightPanelProps) {
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [isContact, setIsContact] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (content?.type === "agent") {
      setIsLoading(true);
      api.get<AgentData>(`/api/agents/${content.id}/detail`)
        .then(async (data) => {
          setAgent(data);
          const contactStatus = await checkIsContact(content.id);
          setIsContact(contactStatus);
        })
        .catch(() => setAgent(null))
        .finally(() => setIsLoading(false));
    } else {
      setAgent(null);
    }
  }, [content]);

  if (!content) return null;

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <span className="text-sm font-medium text-gray-900">
          {content.type === "artifact" ? "产物预览" : "Agent 详情"}
        </span>
        <button
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {content.type === "artifact" ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-sm text-gray-400">
            选择产物查看预览
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-sm text-gray-400">加载中...</div>
        </div>
      ) : !agent ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-sm text-gray-400">选择 Agent 查看详情</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-y-auto">
          <AgentDetailContent agent={agent} />

          {/* Actions */}
          <div className="border-t border-gray-200 px-4 py-3">
            <div className="flex gap-2">
              <button
                onClick={() => startChat(agent.id)}
                className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                开始聊天
              </button>
              <button
                onClick={async () => {
                  await addContact(agent.id);
                  setIsContact(true);
                }}
                disabled={isContact}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50 ${
                  isContact
                    ? "border-gray-200 bg-gray-50 text-gray-400"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {isContact ? "已是联系人" : "添加到联系人"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
