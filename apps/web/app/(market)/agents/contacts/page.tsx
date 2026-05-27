"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AgentAvatar } from "@agenthub/ui";

interface ContactAgent {
  id: string;
  name: string;
  avatarUrl: string | null;
  provider: string;
}

interface ContactItem {
  id: string;
  displayName: string;
  isPinned: boolean;
  tags: string[];
  agent: ContactAgent;
}

export default function ContactListPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchContacts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8123"}/api/contacts/list`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("agenthub_access_token")}`,
          },
        }
      );
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setContacts(data);
    } catch {
      setError("加载联系人列表失败，请重试");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  async function handleTogglePin(contact: ContactItem) {
    setActionLoading(`pin-${contact.id}`);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8123"}/api/contacts/${contact.id}/update`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("agenthub_access_token")}`,
          },
          body: JSON.stringify({ isPinned: !contact.isPinned }),
        }
      );
      if (res.ok) {
        setContacts((prev) =>
          prev.map((c) =>
            c.id === contact.id ? { ...c, isPinned: !c.isPinned } : c
          )
        );
      }
    } catch {
      // Silently fail
    } finally {
      setActionLoading(null);
    }
  }

  function handleStartEdit(contact: ContactItem) {
    setEditingId(contact.id);
    setEditName(contact.displayName);
  }

  async function handleSaveEdit(contactId: string) {
    if (!editName.trim()) return;
    setActionLoading(`edit-${contactId}`);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8123"}/api/contacts/${contactId}/update`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("agenthub_access_token")}`,
          },
          body: JSON.stringify({ displayName: editName.trim() }),
        }
      );
      if (res.ok) {
        setContacts((prev) =>
          prev.map((c) =>
            c.id === contactId ? { ...c, displayName: editName.trim() } : c
          )
        );
      }
    } catch {
      // Silently fail
    } finally {
      setEditingId(null);
      setActionLoading(null);
    }
  }

  async function handleDelete(contactId: string) {
    setActionLoading(`delete-${contactId}`);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8123"}/api/contacts/${contactId}/delete`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("agenthub_access_token")}`,
          },
        }
      );
      if (res.ok) {
        setContacts((prev) => prev.filter((c) => c.id !== contactId));
      }
    } catch {
      // Silently fail
    } finally {
      setDeleteConfirmId(null);
      setActionLoading(null);
    }
  }

  // Sort: pinned first, then by displayName
  const sortedContacts = [...contacts].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/agents")}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-900">联系人管理</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
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
              onClick={fetchContacts}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              重试
            </button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && sortedContacts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="mb-4 text-sm text-gray-500">暂无联系人</p>
            <button
              onClick={() => router.push("/agents")}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              浏览 Agent
            </button>
          </div>
        )}

        {/* Contact List */}
        {!isLoading && !error && sortedContacts.length > 0 && (
          <div className="space-y-2">
            {sortedContacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white px-5 py-4"
              >
                <AgentAvatar
                  name={contact.displayName}
                  avatarUrl={contact.agent.avatarUrl}
                  size="md"
                />

                {/* Name Area */}
                <div className="flex-1 min-w-0">
                  {editingId === contact.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveEdit(contact.id)}
                        disabled={actionLoading === `edit-${contact.id}`}
                        className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {contact.displayName}
                        </p>
                        {contact.isPinned && (
                          <svg className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{contact.agent.name}</p>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Pin Toggle */}
                  <button
                    onClick={() => handleTogglePin(contact)}
                    disabled={actionLoading === `pin-${contact.id}`}
                    className={`rounded p-1.5 ${
                      contact.isPinned
                        ? "text-blue-500 hover:bg-blue-50"
                        : "text-gray-400 hover:bg-gray-100"
                    } disabled:opacity-50`}
                    title={contact.isPinned ? "取消置顶" : "置顶"}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => handleStartEdit(contact)}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    title="编辑名称"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>

                  {/* Delete */}
                  {deleteConfirmId === contact.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(contact.id)}
                        disabled={actionLoading === `delete-${contact.id}`}
                        className="rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600 disabled:opacity-50"
                      >
                        确认
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(contact.id)}
                      className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                      title="删除"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
