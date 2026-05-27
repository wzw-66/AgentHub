import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AgentAvatar } from "../AgentAvatar.js";

afterEach(cleanup);

describe("AgentAvatar", () => {
  it("renders image when avatarUrl is provided", () => {
    render(
      <AgentAvatar name="Test Agent" avatarUrl="https://example.com/avatar.png" />,
    );
    const img = screen.getByTestId("agent-avatar-img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/avatar.png");
    expect(img).toHaveAttribute("alt", "Test Agent");
  });

  it("shows initials when no avatarUrl", () => {
    render(<AgentAvatar name="Claude" />);
    const el = screen.getByTestId("agent-avatar-initials");
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent("C");
  });

  it("applies correct size class for sm", () => {
    render(<AgentAvatar name="Agent" size="sm" />);
    const el = screen.getByTestId("agent-avatar-initials");
    expect(el).toHaveStyle({ width: "32px", height: "32px" });
  });

  it("applies correct size class for lg", () => {
    render(<AgentAvatar name="Agent" size="lg" />);
    const el = screen.getByTestId("agent-avatar-initials");
    expect(el).toHaveStyle({ width: "48px", height: "48px" });
  });

  it("applies className to root element", () => {
    render(
      <AgentAvatar name="Agent" className="custom-class" />,
    );
    const el = screen.getByTestId("agent-avatar-initials");
    expect(el.className).toContain("custom-class");
  });
});
