"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useChat } from "@/lib/chat-context";
import type { Conversation } from "@agenthub/shared";

interface SidebarProps {
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
}

function getDisplayName(conv: Conversation): string {
  return conv.title || "未命名会话";
}

function getLastMessagePreview(conv: Conversation): string | undefined {
  return conv.lastMessageAt
    ? `最后消息: ${new Date(conv.lastMessageAt).toLocaleTimeString()}`
    : undefined;
}

export default function Sidebar({
  activeConversationId,
  onSelectConversation,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const {
    conversations,
    agents,
    isLoadingConversations,
    createConversation,
    fetchConversations,
  } = useChat();
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatTitle, setNewChatTitle] = useState("");

  const filteredConversations = conversations.filter((c) =>
    getDisplayName(c).toLowerCase().includes(searchQuery.toLowerCase()),
  );

  async function handleCreateConversation(agentId: string) {
    try {
      const conv = await createConversation(
        newChatTitle || `与 ${agentId} 的对话`,
        "single",
        [agentId],
      );
      onSelectConversation(conv.id);
      setShowNewChat(false);
      setNewChatTitle("");
      fetchConversations();
    } catch {
      // Handle error silently
    }
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* User Info */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-sm font-medium text-white">
            {user?.username?.charAt(0).toUpperCase() || "U"}
          </div>
          <span className="text-sm font-medium text-gray-900">
            {user?.username || "用户"}
          </span>
        </div>
        <button
          onClick={logout}
          className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 hover:text-gray-700"
          title="退出登录"
        >
          退出
        </button>
      </div>

      {/* Agent Market Nav */}
      <div className="border-b border-gray-200 px-4 py-2">
        <button
          onClick={() => router.push("/agents")}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Agent 市场
        </button>
      </div>

      {/* Search */}
      <div className="border-b border-gray-200 px-4 py-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索会话..."
          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* New Chat Button */}
      <div className="px-4 py-2">
        <button
          onClick={() => setShowNewChat(true)}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          新建聊天
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {isLoadingConversations ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            加载中...
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            暂无会话
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-100 ${
                activeConversationId === conv.id ? "bg-blue-50" : ""
              }`}
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-300 text-sm text-gray-600">
                {getDisplayName(conv).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {getDisplayName(conv)}
                  </span>
                </div>
                {getLastMessagePreview(conv) && (
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {getLastMessagePreview(conv)}
                  </p>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {/* New Chat Dialog */}
      {showNewChat && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-96 rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-medium text-gray-900">
              新建聊天
            </h3>
            <div className="mb-4">
              <input
                type="text"
                value={newChatTitle}
                onChange={(e) => setNewChatTitle(e.target.value)}
                placeholder="会话名称（可选）"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium text-gray-500">
                选择 Agent
              </p>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {agents.length === 0 ? (
                  <p className="text-sm text-gray-400">暂无可用 Agent</p>
                ) : (
                  agents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => handleCreateConversation(agent.id)}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-300 text-xs text-gray-600">
                        {agent.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {agent.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {agent.provider}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewChat(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
