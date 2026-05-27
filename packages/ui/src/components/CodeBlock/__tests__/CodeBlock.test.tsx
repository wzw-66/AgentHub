import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CodeBlock } from "../CodeBlock.js";

afterEach(cleanup);

describe("CodeBlock", () => {
  it("renders code content", () => {
    render(<CodeBlock code="const x = 1;" language="typescript" />);
    expect(screen.getByTestId("codeblock")).toBeInTheDocument();
    expect(screen.getByTestId("codeblock").textContent).toContain("const x = 1");
  });

  it("renders copy button", () => {
    render(<CodeBlock code="test" />);
    expect(screen.getByTestId("codeblock-copy-btn")).toBeInTheDocument();
  });

  it("calls clipboard API on copy button click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<CodeBlock code="copy this" />);
    fireEvent.click(screen.getByTestId("codeblock-copy-btn"));
    expect(writeText).toHaveBeenCalledWith("copy this");
  });

  it("shows language label", () => {
    render(<CodeBlock code="hello" language="python" />);
    expect(screen.getByTestId("codeblock").textContent).toContain("python");
  });

  it("applies className to root element", () => {
    render(<CodeBlock code="test" className="custom-123" />);
    expect(screen.getByTestId("codeblock").className).toContain("custom-123");
  });
});
