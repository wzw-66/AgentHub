import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MessageType, SenderType } from "@agenthub/shared";
import type { Message } from "@agenthub/shared";

// ─── Mock setup ─────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockSendMessage = vi.fn();

// Default mock return value for useChat — swapped per describe block
let mockUseChat = () => ({
  conversations: [{ id: "conv-1", title: "测试对话", type: "single" as const, ownerId: "user-1", createdAt: new Date(), updatedAt: new Date() }],
  agents: [],
  isLoadingConversations: false,
  isLoadingMessages: false,
  isLoadingAgents: false,
  messages: [] as Message[],
  streamingMessage: null as Record<string, unknown> | null,
  typingAgents: new Map(),
  activeConversationId: "conv-1",
  setActiveConversation: vi.fn(),
  fetchConversations: vi.fn(),
  fetchMessages: vi.fn(),
  sendMessage: mockSendMessage,
  createConversation: vi.fn(),
  setTypingAgent: vi.fn(),
  appendMessageChunk: vi.fn(),
  finalizeMessage: vi.fn(),
});

vi.mock("@/lib/chat-context", () => ({
  useChat: () => mockUseChat(),
}));

vi.mock("@agenthub/ui", () => ({
  MessageBubble: ({
    message,
    variant,
    children,
  }: {
    message: { content: string; senderType: string };
    variant: string;
    children: React.ReactNode;
  }) => (
    <div
      data-testid="message-bubble"
      data-variant={variant}
      data-content={message.content}
    >
      {children}
    </div>
  ),
  CodeBlock: ({ code }: { code: string }) => (
    <div data-testid="code-block">{code}</div>
  ),
}));

vi.mock("@/components/MentionPopup", () => ({
  default: () => <div data-testid="mention-popup" />,
}));

vi.mock("@/components/TypingIndicator", () => ({
  default: () => <div data-testid="typing-indicator" />,
}));

import ChatPanel from "@/components/ChatPanel";

// ─── Test data ──────────────────────────────────────────────────────────

const userMessage: Message = {
  id: "msg-1",
  conversationId: "conv-1",
  content: "你好，我是用户",
  senderType: SenderType.User,
  senderId: "user-1",
  type: MessageType.Text,
  createdAt: new Date("2026-05-27T10:00:00Z").toISOString(),
  updatedAt: new Date("2026-05-27T10:00:00Z").toISOString(),
};

const contactMessage: Message = {
  id: "msg-2",
  conversationId: "conv-1",
  content: "你好！我是 Claude，有什么可以帮助你的？",
  senderType: SenderType.Contact,
  senderId: "agent-1",
  type: MessageType.Text,
  createdAt: new Date("2026-05-27T10:00:05Z").toISOString(),
  updatedAt: new Date("2026-05-27T10:00:05Z").toISOString(),
};

const systemMessage: Message = {
  id: "msg-3",
  conversationId: "conv-1",
  content: "系统消息：Agent 已加入对话",
  senderType: SenderType.System,
  senderId: "system",
  type: MessageType.Text,
  createdAt: new Date("2026-05-27T10:00:10Z").toISOString(),
  updatedAt: new Date("2026-05-27T10:00:10Z").toISOString(),
};

// ─── Message Rendering Tests ────────────────────────────────────────────

describe("ChatPanel - message rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChat = () => ({
      conversations: [{ id: "conv-1", title: "测试对话", type: "single" as const, ownerId: "user-1", createdAt: new Date(), updatedAt: new Date() }],
      agents: [],
      isLoadingConversations: false,
      isLoadingMessages: false,
      isLoadingAgents: false,
      messages: [userMessage, contactMessage, systemMessage],
      streamingMessage: null,
      typingAgents: new Map(),
      activeConversationId: "conv-1",
      setActiveConversation: vi.fn(),
      fetchConversations: vi.fn(),
      fetchMessages: vi.fn(),
      sendMessage: mockSendMessage,
      createConversation: vi.fn(),
      setTypingAgent: vi.fn(),
      appendMessageChunk: vi.fn(),
      finalizeMessage: vi.fn(),
    });
  });

  it("renders conversation header with title", () => {
    render(<ChatPanel conversationId="conv-1" />);
    expect(screen.getByText("测试对话")).toBeInTheDocument();
  });

  it("renders all messages", () => {
    render(<ChatPanel conversationId="conv-1" />);

    const bubbles = screen.getAllByTestId("message-bubble");
    expect(bubbles).toHaveLength(3);
  });

  it("renders user message with user variant", () => {
    render(<ChatPanel conversationId="conv-1" />);

    const bubbles = screen.getAllByTestId("message-bubble");
    const userBubble = bubbles.find(
      (b) => b.getAttribute("data-variant") === "user",
    );
    expect(userBubble).toBeTruthy();
    expect(userBubble?.getAttribute("data-content")).toBe("你好，我是用户");
  });

  it("renders contact message with contact variant", () => {
    render(<ChatPanel conversationId="conv-1" />);

    const bubbles = screen.getAllByTestId("message-bubble");
    const contactBubble = bubbles.find(
      (b) => b.getAttribute("data-variant") === "contact",
    );
    expect(contactBubble).toBeTruthy();
    expect(contactBubble?.getAttribute("data-content")).toContain("Claude");
  });

  it("renders system message with system variant", () => {
    render(<ChatPanel conversationId="conv-1" />);

    const bubbles = screen.getAllByTestId("message-bubble");
    const systemBubble = bubbles.find(
      (b) => b.getAttribute("data-variant") === "system",
    );
    expect(systemBubble).toBeTruthy();
  });

  it("shows empty messages state", () => {
    mockUseChat = () => ({
      conversations: [{ id: "conv-1", title: "测试对话", type: "single" as const, ownerId: "user-1", createdAt: new Date(), updatedAt: new Date() }],
      agents: [], isLoadingConversations: false,
      isLoadingMessages: false, isLoadingAgents: false,
      messages: [], streamingMessage: null,
      typingAgents: new Map(), activeConversationId: "conv-1",
      setActiveConversation: vi.fn(), fetchConversations: vi.fn(),
      fetchMessages: vi.fn(), sendMessage: mockSendMessage,
      createConversation: vi.fn(), setTypingAgent: vi.fn(),
      appendMessageChunk: vi.fn(), finalizeMessage: vi.fn(),
    });
    render(<ChatPanel conversationId="conv-1" />);

    expect(screen.getByText("暂无消息，开始聊天吧")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockUseChat = () => ({
      conversations: [{ id: "conv-1", title: "测试对话", type: "single" as const, ownerId: "user-1", createdAt: new Date(), updatedAt: new Date() }],
      agents: [], isLoadingConversations: false,
      isLoadingMessages: true, isLoadingAgents: false,
      messages: [], streamingMessage: null,
      typingAgents: new Map(), activeConversationId: "conv-1",
      setActiveConversation: vi.fn(), fetchConversations: vi.fn(),
      fetchMessages: vi.fn(), sendMessage: mockSendMessage,
      createConversation: vi.fn(), setTypingAgent: vi.fn(),
      appendMessageChunk: vi.fn(), finalizeMessage: vi.fn(),
    });
    render(<ChatPanel conversationId="conv-1" />);

    expect(screen.getByText("消息加载中...")).toBeInTheDocument();
  });
});

// ─── Streaming Message Tests ────────────────────────────────────────────

describe("ChatPanel - streaming messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChat = () => ({
      conversations: [{ id: "conv-1", title: "测试对话", type: "single" as const, ownerId: "user-1", createdAt: new Date(), updatedAt: new Date() }],
      agents: [],
      isLoadingConversations: false,
      isLoadingMessages: false,
      isLoadingAgents: false,
      messages: [],
      streamingMessage: {
        id: "stream-1",
        conversationId: "conv-1",
        content: "正在思考",
        senderType: SenderType.Contact,
        senderId: "agent-1",
        type: MessageType.Text,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isStreaming: true,
      },
      typingAgents: new Map(),
      activeConversationId: "conv-1",
      setActiveConversation: vi.fn(),
      fetchConversations: vi.fn(),
      fetchMessages: vi.fn(),
      sendMessage: mockSendMessage,
      createConversation: vi.fn(),
      setTypingAgent: vi.fn(),
      appendMessageChunk: vi.fn(),
      finalizeMessage: vi.fn(),
    });
  });

  it("renders streaming message when present", () => {
    render(<ChatPanel conversationId="conv-1" />);

    const bubbles = screen.getAllByTestId("message-bubble");
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0]?.getAttribute("data-variant")).toBe("contact");
  });

  it("streaming message content is displayed", () => {
    render(<ChatPanel conversationId="conv-1" />);

    expect(screen.getByText("正在思考")).toBeInTheDocument();
  });

  it("shows cursor animation with streaming message", () => {
    render(<ChatPanel conversationId="conv-1" />);

    // The cursor is a span with animate-pulse
    const cursor = document.querySelector(".animate-pulse");
    expect(cursor).toBeTruthy();
  });
});

// ─── Message Sending Tests ──────────────────────────────────────────────

describe("ChatPanel - message sending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChat = () => ({
      conversations: [{ id: "conv-1", title: "测试对话", type: "single" as const, ownerId: "user-1", createdAt: new Date(), updatedAt: new Date() }],
      agents: [],
      isLoadingConversations: false,
      isLoadingMessages: false,
      isLoadingAgents: false,
      messages: [],
      streamingMessage: null,
      typingAgents: new Map(),
      activeConversationId: "conv-1",
      setActiveConversation: vi.fn(),
      fetchConversations: vi.fn(),
      fetchMessages: vi.fn(),
      sendMessage: mockSendMessage,
      createConversation: vi.fn(),
      setTypingAgent: vi.fn(),
      appendMessageChunk: vi.fn(),
      finalizeMessage: vi.fn(),
    });
  });

  it("renders input textarea and send button", () => {
    render(<ChatPanel conversationId="conv-1" />);

    expect(
      screen.getByPlaceholderText("输入消息... (Enter 发送, Shift+Enter 换行)"),
    ).toBeInTheDocument();
  });

  it("send button is disabled when input is empty", () => {
    render(<ChatPanel conversationId="conv-1" />);

    const sendButton = screen.getByRole("button");
    expect(sendButton).toBeDisabled();
  });

  it("send button is enabled when input has text", () => {
    render(<ChatPanel conversationId="conv-1" />);

    const textarea = screen.getByPlaceholderText(
      "输入消息... (Enter 发送, Shift+Enter 换行)",
    );
    fireEvent.change(textarea, { target: { value: "Hello!" } });

    const sendButton = screen.getByRole("button");
    expect(sendButton).not.toBeDisabled();
  });

  it("sends message on Enter key press", async () => {
    mockSendMessage.mockResolvedValueOnce({
      id: "msg-new",
      content: "Hello!",
      senderType: "user",
    });

    render(<ChatPanel conversationId="conv-1" />);

    const textarea = screen.getByPlaceholderText(
      "输入消息... (Enter 发送, Shift+Enter 换行)",
    );
    fireEvent.change(textarea, { target: { value: "Hello!" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith("conv-1", "Hello!");
    });
  });

  it("clears input after sending", async () => {
    mockSendMessage.mockResolvedValueOnce({
      id: "msg-new",
      content: "Hello!",
    });

    render(<ChatPanel conversationId="conv-1" />);

    const textarea = screen.getByPlaceholderText(
      "输入消息... (Enter 发送, Shift+Enter 换行)",
    );
    fireEvent.change(textarea, { target: { value: "Hello!" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(textarea).toHaveValue("");
    });
  });

  it("does not send when Shift+Enter is pressed", async () => {
    render(<ChatPanel conversationId="conv-1" />);

    const textarea = screen.getByPlaceholderText(
      "输入消息... (Enter 发送, Shift+Enter 换行)",
    );
    fireEvent.change(textarea, { target: { value: "Hello!" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("does not send when input is empty", async () => {
    render(<ChatPanel conversationId="conv-1" />);

    const textarea = screen.getByPlaceholderText(
      "输入消息... (Enter 发送, Shift+Enter 换行)",
    );
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("sends message on send button click", async () => {
    mockSendMessage.mockResolvedValueOnce({
      id: "msg-new",
      content: "Hello!",
    });

    render(<ChatPanel conversationId="conv-1" />);

    const textarea = screen.getByPlaceholderText(
      "输入消息... (Enter 发送, Shift+Enter 换行)",
    );
    fireEvent.change(textarea, { target: { value: "Hello!" } });

    const sendButton = screen.getByRole("button");
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith("conv-1", "Hello!");
    });
  });
});

// ─── Code Block Rendering ───────────────────────────────────────────────

describe("ChatPanel - code blocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders code block for message with ``` content", () => {
    const codeMessage: Message = {
      id: "msg-code",
      conversationId: "conv-1",
      content: "```javascript\nconsole.log('hello');\n```",
      senderType: SenderType.Contact,
      senderId: "agent-1",
      type: MessageType.Text,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockUseChat = () => ({
      conversations: [{ id: "conv-1", title: "测试对话", type: "single" as const, ownerId: "user-1", createdAt: new Date(), updatedAt: new Date() }],
      agents: [],
      isLoadingConversations: false,
      isLoadingMessages: false,
      isLoadingAgents: false,
      messages: [codeMessage],
      streamingMessage: null,
      typingAgents: new Map(),
      activeConversationId: "conv-1",
      setActiveConversation: vi.fn(),
      fetchConversations: vi.fn(),
      fetchMessages: vi.fn(),
      sendMessage: mockSendMessage,
      createConversation: vi.fn(),
      setTypingAgent: vi.fn(),
      appendMessageChunk: vi.fn(),
      finalizeMessage: vi.fn(),
    });
    render(<ChatPanel conversationId="conv-1" />);

    expect(screen.getByTestId("code-block")).toBeInTheDocument();
  });
});

// ─── Full Chain Integration Tests ──────────────────────────────────────

describe("ChatPanel - full chain integration", () => {
  const fullUserMessage: Message = {
    id: "msg-user",
    conversationId: "conv-1",
    content: "帮我写一个排序算法",
    senderType: SenderType.User,
    senderId: "user-1",
    type: MessageType.Text,
    createdAt: new Date("2026-05-27T10:00:00Z").toISOString(),
    updatedAt: new Date("2026-05-27T10:00:00Z").toISOString(),
  };

  const fullStreamMessage: Message = {
    id: "msg-stream",
    conversationId: "conv-1",
    content: "好的，这是一个快速排序",
    senderType: SenderType.Contact,
    senderId: "agent-1",
    type: MessageType.Text,
    createdAt: new Date("2026-05-27T10:00:05Z").toISOString(),
    updatedAt: new Date("2026-05-27T10:00:05Z").toISOString(),
    isStreaming: true,
  };

  const fullAgentMessage: Message = {
    id: "msg-agent",
    conversationId: "conv-1",
    content: "```javascript\nfunction quickSort(arr) {\n  if (arr.length <= 1) return arr;\n}\n```",
    senderType: SenderType.Contact,
    senderId: "agent-1",
    type: MessageType.Text,
    createdAt: new Date("2026-05-27T10:00:10Z").toISOString(),
    updatedAt: new Date("2026-05-27T10:00:10Z").toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMessage.mockResolvedValue({ id: "msg-user", content: "帮我写一个排序算法" });
  });

  it("full chain: send message → streaming → final response with code", async () => {
    // Step 1: Empty chat
    mockUseChat = () => ({
      conversations: [{ id: "conv-1", title: "测试对话", type: "single" as const, ownerId: "user-1", createdAt: new Date(), updatedAt: new Date() }],
      agents: [],
      isLoadingConversations: false,
      isLoadingMessages: false,
      isLoadingAgents: false,
      messages: [],
      streamingMessage: null,
      typingAgents: new Map(),
      activeConversationId: "conv-1",
      setActiveConversation: vi.fn(),
      fetchConversations: vi.fn(),
      fetchMessages: vi.fn(),
      sendMessage: mockSendMessage,
      createConversation: vi.fn(),
      setTypingAgent: vi.fn(),
      appendMessageChunk: vi.fn(),
      finalizeMessage: vi.fn(),
    });
    const { rerender } = render(<ChatPanel conversationId="conv-1" />);
    expect(screen.getByText("暂无消息，开始聊天吧")).toBeInTheDocument();

    // Step 2: User sends a message — show user message in list
    mockUseChat = () => ({
      conversations: [{ id: "conv-1", title: "测试对话", type: "single" as const, ownerId: "user-1", createdAt: new Date(), updatedAt: new Date() }],
      agents: [],
      isLoadingConversations: false,
      isLoadingMessages: false,
      isLoadingAgents: false,
      messages: [fullUserMessage],
      streamingMessage: null,
      typingAgents: new Map(),
      activeConversationId: "conv-1",
      setActiveConversation: vi.fn(),
      fetchConversations: vi.fn(),
      fetchMessages: vi.fn(),
      sendMessage: mockSendMessage,
      createConversation: vi.fn(),
      setTypingAgent: vi.fn(),
      appendMessageChunk: vi.fn(),
      finalizeMessage: vi.fn(),
    });
    rerender(<ChatPanel conversationId="conv-1" />);
    expect(screen.getByText("帮我写一个排序算法")).toBeInTheDocument();

    // Step 3: Agent starts streaming response
    mockUseChat = () => ({
      conversations: [{ id: "conv-1", title: "测试对话", type: "single" as const, ownerId: "user-1", createdAt: new Date(), updatedAt: new Date() }],
      agents: [],
      isLoadingConversations: false,
      isLoadingMessages: false,
      isLoadingAgents: false,
      messages: [fullUserMessage],
      streamingMessage: fullStreamMessage,
      typingAgents: new Map(),
      activeConversationId: "conv-1",
      setActiveConversation: vi.fn(),
      fetchConversations: vi.fn(),
      fetchMessages: vi.fn(),
      sendMessage: mockSendMessage,
      createConversation: vi.fn(),
      setTypingAgent: vi.fn(),
      appendMessageChunk: vi.fn(),
      finalizeMessage: vi.fn(),
    });
    rerender(<ChatPanel conversationId="conv-1" />);
    expect(screen.getByText("好的，这是一个快速排序")).toBeInTheDocument();

    // Step 4: Streaming complete — final agent message with code block
    mockUseChat = () => ({
      conversations: [{ id: "conv-1", title: "测试对话", type: "single" as const, ownerId: "user-1", createdAt: new Date(), updatedAt: new Date() }],
      agents: [],
      isLoadingConversations: false,
      isLoadingMessages: false,
      isLoadingAgents: false,
      messages: [fullUserMessage, fullAgentMessage],
      streamingMessage: null,
      typingAgents: new Map(),
      activeConversationId: "conv-1",
      setActiveConversation: vi.fn(),
      fetchConversations: vi.fn(),
      fetchMessages: vi.fn(),
      sendMessage: mockSendMessage,
      createConversation: vi.fn(),
      setTypingAgent: vi.fn(),
      appendMessageChunk: vi.fn(),
      finalizeMessage: vi.fn(),
    });
    rerender(<ChatPanel conversationId="conv-1" />);
    const bubbles = screen.getAllByTestId("message-bubble");
    expect(bubbles).toHaveLength(2);
    expect(screen.getByTestId("code-block")).toBeInTheDocument();
  });
});
