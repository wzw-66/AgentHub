import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CreateAgentModal from "@/components/CreateAgentModal";

// Mock api-client
vi.mock("@/lib/api-client", () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api } from "@/lib/api-client";

describe("CreateAgentModal", () => {
  const mockOnClose = vi.fn();
  const mockOnCreated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders form fields", () => {
    render(
      <CreateAgentModal onClose={mockOnClose} onCreated={mockOnCreated} />
    );
    expect(screen.getByText("创建自定义 Agent")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Agent 名称")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("模型名称（如 gpt-4, claude-3）")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("输入系统提示词（可选）")
    ).toBeInTheDocument();
  });

  it("shows validation error when name is empty", async () => {
    render(
      <CreateAgentModal onClose={mockOnClose} onCreated={mockOnCreated} />
    );
    fireEvent.click(screen.getByText("创建"));
    expect(screen.getByText("名称不能为空")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("submits form with valid data", async () => {
    const mockPost = vi.mocked(api.post);
    mockPost.mockResolvedValue({});

    render(
      <CreateAgentModal onClose={mockOnClose} onCreated={mockOnCreated} />
    );

    fireEvent.change(screen.getByPlaceholderText("Agent 名称"), {
      target: { value: "My Agent" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("模型名称（如 gpt-4, claude-3）"),
      { target: { value: "gpt-4" } }
    );

    fireEvent.click(screen.getByText("创建"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/api/agents/create", {
        name: "My Agent",
        provider: "custom",
        model: "gpt-4",
        systemPrompt: undefined,
      });
    });

    expect(mockOnCreated).toHaveBeenCalled();
  });

  it("shows error on API failure", async () => {
    const mockPost = vi.mocked(api.post);
    mockPost.mockRejectedValue(new Error("API Error"));

    render(
      <CreateAgentModal onClose={mockOnClose} onCreated={mockOnCreated} />
    );

    fireEvent.change(screen.getByPlaceholderText("Agent 名称"), {
      target: { value: "My Agent" },
    });
    fireEvent.click(screen.getByText("创建"));

    await waitFor(() => {
      expect(screen.getByText("创建失败，请重试")).toBeInTheDocument();
    });

    expect(mockOnCreated).not.toHaveBeenCalled();
  });

  it("calls onClose when cancel is clicked", () => {
    render(
      <CreateAgentModal onClose={mockOnClose} onCreated={mockOnCreated} />
    );
    fireEvent.click(screen.getByText("取消"));
    expect(mockOnClose).toHaveBeenCalled();
  });
});
