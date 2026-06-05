"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AgentAvatar } from "@agenthub/ui";
import { useI18n } from "@/lib/i18n";
import { API_BASE_URL } from "@/lib/api-client";

interface ContactItem {
  id: string;
  name: string;
  displayName: string;
  avatarUrl: string | null;
  provider: string;
  isPinned: boolean;
  tags: string[];
}

export default function ContactListPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const API = API_BASE_URL;
  const token = typeof window !== "undefined" ? localStorage.getItem("agenthub_access_token") : null;

  const fetchContacts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/contacts/list`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("agenthub_access_token")}` },
      });
      if (!res.ok) throw new Error("Failed");
      setContacts(await res.json());
    } catch { setError(t("contacts").failedToLoad); }
    finally { setIsLoading(false); }
  }, [API, t]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  async function handleTogglePin(contact: ContactItem) {
    setActionLoading(`pin-${contact.id}`);
    try {
      const res = await fetch(`${API}/api/contacts/${contact.id}/update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isPinned: !contact.isPinned }),
      });
      if (res.ok) setContacts((prev) => prev.map((c) => c.id === contact.id ? { ...c, isPinned: !c.isPinned } : c));
    } catch { /* silent */ }
    finally { setActionLoading(null); }
  }

  async function handleSaveEdit(contactId: string) {
    if (!editName.trim()) return;
    setActionLoading(`edit-${contactId}`);
    try {
      const res = await fetch(`${API}/api/contacts/${contactId}/update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ displayName: editName.trim() }),
      });
      if (res.ok) setContacts((prev) => prev.map((c) => c.id === contactId ? { ...c, displayName: editName.trim() } : c));
    } catch { /* silent */ }
    finally { setEditingId(null); setActionLoading(null); }
  }

  async function handleDelete(contactId: string) {
    setActionLoading(`delete-${contactId}`);
    try {
      const res = await fetch(`${API}/api/contacts/${contactId}/delete`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setContacts((prev) => prev.filter((c) => c.id !== contactId));
    } catch { /* silent */ }
    finally { setDeleteConfirmId(null); setActionLoading(null); }
  }

  const sortedContacts = [...contacts].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return (a.displayName || a.name).localeCompare(b.displayName || b.name);
  });

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "var(--theme-bg-primary)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: "1px solid var(--theme-border)" }}>
        <button
          onClick={() => router.push("/agents")}
          className="rounded p-1.5 transition-colors hover:bg-[var(--theme-bg-secondary)]"
          style={{ color: "var(--theme-text-dim)" }}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--theme-text-primary)" }}>
            {t("contacts").title}
          </h1>
          <p className="text-xs" style={{ color: "var(--theme-text-dim)" }}>
            {t("contacts").subtitle}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-4 rounded-xl border px-5 py-4"
                style={{ borderColor: "var(--theme-border)", backgroundColor: "var(--theme-bg-surface)" }}>
                <div className="h-10 w-10 rounded-full" style={{ backgroundColor: "var(--theme-bg-elevated)" }} />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded" style={{ backgroundColor: "var(--theme-bg-elevated)" }} />
                  <div className="h-3 w-20 rounded" style={{ backgroundColor: "var(--theme-bg-surface)" }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && error && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-4 rounded-lg border px-4 py-3 text-xs"
              style={{ borderColor: "rgba(244,67,54,0.2)", backgroundColor: "rgba(244,67,54,0.06)", color: "var(--theme-danger)" }}>
              [{t("common").error}] {error}
            </div>
            <button onClick={fetchContacts} className="btn-ghost rounded-lg px-4 py-2 text-xs">
              {t("common").retry}
            </button>
          </div>
        )}

        {!isLoading && !error && sortedContacts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="mb-4 text-xs" style={{ color: "var(--theme-text-dim)" }}>
              {t("contacts").noContacts}
            </p>
            <button onClick={() => router.push("/agents")} className="btn-accent rounded-lg px-4 py-2 text-xs font-semibold">
              {t("contacts").browseAgents}
            </button>
          </div>
        )}

        {!isLoading && !error && sortedContacts.length > 0 && (
          <div className="space-y-1">
            {sortedContacts.map((contact) => (
              <div key={contact.id}
                className="flex items-center gap-4 rounded-xl border px-5 py-4"
                style={{ borderColor: "var(--theme-border)", backgroundColor: "var(--theme-bg-surface)" }}>
                <AgentAvatar name={contact.displayName || contact.name} avatarUrl={contact.avatarUrl} size="md" />

                <div className="flex-1 min-w-0">
                  {editingId === contact.id ? (
                    <div className="flex items-center gap-2">
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                        className="input-theme flex-1 rounded-lg px-2 py-1 text-xs"
                        autoFocus />
                      <button onClick={() => handleSaveEdit(contact.id)} disabled={actionLoading === `edit-${contact.id}`}
                        className="btn-gradient rounded px-2 py-1 text-xs font-semibold disabled:opacity-50">
                        {t("contacts").save}
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="rounded px-2 py-1 text-xs"
                        style={{ color: "var(--theme-text-dim)" }}>
                        {t("contacts").cancel}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate" style={{ color: "var(--theme-text-primary)" }}>
                          {contact.displayName || contact.name}
                        </p>
                        {contact.isPinned && (
                          <svg className="h-3 w-3 flex-shrink-0" fill="var(--theme-accent)" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        )}
                      </div>
                      <p className="text-xs" style={{ color: "var(--theme-text-dim)" }}>
                        {contact.provider}
                      </p>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => handleTogglePin(contact)} disabled={actionLoading === `pin-${contact.id}`}
                    className="rounded p-1.5 transition-colors disabled:opacity-50"
                    style={{ color: contact.isPinned ? "var(--theme-accent)" : "var(--theme-text-dim)" }}
                    title={contact.isPinned ? t("contacts").unpin : t("contacts").pin}>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </button>

                  <button onClick={() => { setEditingId(contact.id); setEditName(contact.displayName || contact.name); }}
                    className="rounded p-1.5 transition-colors hover:text-[var(--theme-accent)]" style={{ color: "var(--theme-text-dim)" }}
                    title={t("contacts").edit}>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>

                  {deleteConfirmId === contact.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDelete(contact.id)} disabled={actionLoading === `delete-${contact.id}`}
                        className="rounded px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        style={{ backgroundColor: "var(--theme-danger)" }}>
                        {t("contacts").confirm}
                      </button>
                      <button onClick={() => setDeleteConfirmId(null)} className="rounded px-2 py-1 text-xs"
                        style={{ color: "var(--theme-text-dim)" }}>
                        {t("contacts").cancel}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirmId(contact.id)}
                      className="rounded p-1.5 transition-colors hover:text-[var(--theme-danger)]"
                      style={{ color: "var(--theme-text-dim)" }}
                      title={t("contacts").delete}>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
