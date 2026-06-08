import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Sidebar from "@/components/Sidebar";
import type { Conversation } from "@agenthub/shared";

// ─── Mocks ──────────────────────────────────────────────────────────────

const mockPush = vi.fn();
const mockRouter = { push: mockPush };

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

const mockUser = { id: "user-1", username: "TestUser", email: "test@test.com" };
const mockLogout = vi.fn();

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: mockLogout,
  }),
}));

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, Record<string, string>> = {
        chat: { searchPlaceholder: "搜索...", emptyConversations: "暂无对话", logout: "退出", selectAgent: "选择 Agent", inputPlaceholder: "输入消息...", loadingMessages: "加载中...", emptySelect: "请选择对话", emptyMessages: "暂无消息" },
        common: { cancel: "取消", save: "保存", delete: "删除", confirm: "确认", loading: "加载中..." },
        rightPanel: { collaborate: "协作" },
      };
      const keys = key.split(".");
      return keys.reduce((obj: Record<string, string>, k: string) => obj?.[k] ?? key, translations as unknown as Record<string, string>);
    },
    locale: "zh",
    setLocale: vi.fn(),
  }),
}));

type Conv = Conversation;

const mockCreateConversation = vi.fn();
const mockFetchConversations = vi.fn();

// Dynamic mock state — these variables can be overridden per test
let mockChatOverrides: Record<string, unknown> = {};

vi.mock("@/lib/chat-context", () => {
  const actualConversations: Conv[] = [
    {
      id: "conv-1",
      title: "与 Claude 的对话",
      type: "single",
      ownerId: "user-1",
      createdAt: new Date("2026-05-27T10:00:00Z"),
      updatedAt: new Date("2026-05-27T10:30:00Z"),
      lastMessageAt: new Date("2026-05-27T10:30:00Z"),
    },
    {
      id: "conv-2",
      title: "群聊讨论",
      type: "group",
      ownerId: "user-1",
      createdAt: new Date("2026-05-26T10:00:00Z"),
      updatedAt: new Date("2026-05-26T15:00:00Z"),
      lastMessageAt: new Date("2026-05-26T15:00:00Z"),
    },
    {
      id: "conv-3",
      title: "与 OpenCode 的对话",
      type: "single",
      ownerId: "user-1",
      createdAt: new Date("2026-05-25T10:00:00Z"),
      updatedAt: new Date("2026-05-25T11:00:00Z"),
    },
  ];

  return {
    useChat: () => ({
      conversations: (mockChatOverrides.conversations as Conv[]) ?? actualConversations,
      agents: [
        { id: "agent-1", name: "Claude", provider: "claude" },
        { id: "agent-2", name: "OpenCode", provider: "opencode" },
      ],
      isLoadingConversations: (mockChatOverrides.isLoadingConversations as boolean) ?? false,
      isLoadingAgents: false,
      messages: [],
      streamingMessage: null,
      typingAgents: new Map(),
      activeConversationId: null,
      setActiveConversation: vi.fn(),
      fetchConversations: mockFetchConversations,
      fetchMessages: vi.fn(),
      sendMessage: vi.fn(),
      createConversation: mockCreateConversation,
      setTypingAgent: vi.fn(),
      appendMessageChunk: vi.fn(),
      finalizeMessage: vi.fn(),
    }),
  };
});

vi.mock("@agenthub/ui", () => ({
  AgentAvatar: ({ name }: { name: string }) => (
    <div data-testid="agent-avatar">{name}</div>
  ),
  CodeBlock: ({ code, language }: { code: string; language: string }) => (
    <div data-testid="code-block">{language}: {code}</div>
  ),
}));

// ─── Sidebar Tests ──────────────────────────────────────────────────────

describe("Sidebar", () => {
  const onSelectConversation = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockChatOverrides = {};
  });

  it("renders user info from auth context", () => {
    render(
      <Sidebar
        activeConversationId={null}
        onSelectConversation={onSelectConversation}
      />,
    );

    expect(screen.getByText("TestUser")).toBeInTheDocument();
  });

  it("renders search input", () => {
    render(
      <Sidebar
        activeConversationId={null}
        onSelectConversation={onSelectConversation}
      />,
    );

    expect(
      screen.getByPlaceholderText("搜索会话..."),
    ).toBeInTheDocument();
  });

  it("renders new chat button", () => {
    render(
      <Sidebar
        activeConversationId={null}
        onSelectConversation={onSelectConversation}
      />,
    );

    expect(screen.getByText("新建聊天")).toBeInTheDocument();
  });

  it("renders conversation list", () => {
    render(
      <Sidebar
        activeConversationId={null}
        onSelectConversation={onSelectConversation}
      />,
    );

    expect(screen.getByText("与 Claude 的对话")).toBeInTheDocument();
    expect(screen.getByText("群聊讨论")).toBeInTheDocument();
    expect(screen.getByText("与 OpenCode 的对话")).toBeInTheDocument();
  });

  it("highlights the active conversation", () => {
    render(
      <Sidebar
        activeConversationId="conv-1"
        onSelectConversation={onSelectConversation}
      />,
    );

    const activeButton = screen.getByText("与 Claude 的对话").closest("button");
    expect(activeButton?.className).toContain("bg-blue-50");
  });

  it("calls onSelectConversation when a conversation is clicked", () => {
    render(
      <Sidebar
        activeConversationId={null}
        onSelectConversation={onSelectConversation}
      />,
    );

    fireEvent.click(screen.getByText("与 Claude 的对话"));
    expect(onSelectConversation).toHaveBeenCalledWith("conv-1");
  });

  it("filters conversations by search query", () => {
    render(
      <Sidebar
        activeConversationId={null}
        onSelectConversation={onSelectConversation}
      />,
    );

    const searchInput = screen.getByPlaceholderText("搜索会话...");
    fireEvent.change(searchInput, { target: { value: "Claude" } });

    expect(screen.getByText("与 Claude 的对话")).toBeInTheDocument();
    expect(screen.queryByText("群聊讨论")).not.toBeInTheDocument();
    expect(screen.queryByText("与 OpenCode 的对话")).not.toBeInTheDocument();
  });

  it("shows loading state when conversations are loading", () => {
    mockChatOverrides.isLoadingConversations = true;

    render(
      <Sidebar
        activeConversationId={null}
        onSelectConversation={onSelectConversation}
      />,
    );

    expect(screen.getByText("加载中...")).toBeInTheDocument();

    mockChatOverrides = {};
  });

  it("shows empty state when no conversations exist", () => {
    mockChatOverrides.conversations = [];

    render(
      <Sidebar
        activeConversationId={null}
        onSelectConversation={onSelectConversation}
      />,
    );

    expect(screen.getByText("暂无会话")).toBeInTheDocument();

    mockChatOverrides = {};
  });

  it("shows agent market navigation button", () => {
    render(
      <Sidebar
        activeConversationId={null}
        onSelectConversation={onSelectConversation}
      />,
    );

    expect(screen.getByText("Agent 市场")).toBeInTheDocument();
  });

  it("calls logout when logout button is clicked", () => {
    render(
      <Sidebar
        activeConversationId={null}
        onSelectConversation={onSelectConversation}
      />,
    );

    fireEvent.click(screen.getByText("退出"));
    expect(mockLogout).toHaveBeenCalled();
  });

  it("shows new chat dialog when new chat button is clicked", () => {
    render(
      <Sidebar
        activeConversationId={null}
        onSelectConversation={onSelectConversation}
      />,
    );

    // Click the "新建聊天" button (the one with the dashed border)
    const buttons = screen.getAllByText("新建聊天");
    fireEvent.click(buttons[0]!);
    // Modal should show agent list
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getByText("OpenCode")).toBeInTheDocument();
  });
});

// ─── ChatPanel Empty State ─────────────────────────────────────────────

vi.mock("@/components/MentionPopup", () => ({
  default: () => <div data-testid="mention-popup" />,
}));

vi.mock("@/components/TypingIndicator", () => ({
  default: () => <div data-testid="typing-indicator" />,
}));

import ChatPanel from "@/components/ChatPanel";

describe("ChatPanel - empty state", () => {
  it("shows empty state when no conversation is selected", () => {
    render(
      <ChatPanel conversationId={null} onShowArtifact={vi.fn()} onShowAgent={vi.fn()} />,
    );

    expect(screen.getByText("选择一个会话开始聊天")).toBeInTheDocument();
  });
});

// ─── Sidebar New Chat Dialog ────────────────────────────────────────────

describe("Sidebar - new chat dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates conversation when an agent is selected", async () => {
    mockCreateConversation.mockResolvedValueOnce({ id: "new-conv" });

    render(
      <Sidebar
        activeConversationId={null}
        onSelectConversation={vi.fn()}
      />,
    );

    // Open dialog by clicking the first "新建聊天" button
    const buttons = screen.getAllByText("新建聊天");
    fireEvent.click(buttons[0]!);
    // Click agent
    fireEvent.click(screen.getByText("Claude"));

    await waitFor(() => {
      expect(mockCreateConversation).toHaveBeenCalledWith(
        expect.any(String),
        "single",
        ["agent-1"],
      );
    });
  });

  it("closes dialog when cancel is clicked", () => {
    render(
      <Sidebar
        activeConversationId={null}
        onSelectConversation={vi.fn()}
      />,
    );

    const buttons = screen.getAllByText("新建聊天");
    fireEvent.click(buttons[0]!);
    expect(screen.getByText("选择 Agent")).toBeInTheDocument();

    fireEvent.click(screen.getByText("取消"));
    expect(screen.queryByText("选择 Agent")).not.toBeInTheDocument();
  });
});
