import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AgentCard from "@/components/AgentCard";

describe("AgentCard", () => {
  const baseAgent = {
    id: "agent-1",
    name: "Test Agent",
    provider: "claude",
    avatarUrl: undefined,
    model: "claude-3-opus",
  };

  it("renders agent name and provider", () => {
    render(<AgentCard agent={baseAgent} onClick={() => {}} />);
    expect(screen.getByText("Test Agent")).toBeInTheDocument();
    expect(screen.getByText("Claude · claude-3-opus")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<AgentCard agent={baseAgent} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledWith("agent-1");
  });

  it("displays custom provider label", () => {
    render(
      <AgentCard
        agent={{ ...baseAgent, provider: "custom", model: null }}
        onClick={() => {}}
      />
    );
    expect(screen.getByText("自定义")).toBeInTheDocument();
  });

  it("displays opencode provider label", () => {
    render(
      <AgentCard
        agent={{ ...baseAgent, provider: "opencode", model: null }}
        onClick={() => {}}
      />
    );
    expect(screen.getByText("OpenCode")).toBeInTheDocument();
  });
});
