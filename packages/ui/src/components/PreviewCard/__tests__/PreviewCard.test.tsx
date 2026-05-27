import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PreviewCard } from "../PreviewCard.js";

afterEach(cleanup);

describe("PreviewCard", () => {
  it("renders iframe with correct URL", () => {
    render(<PreviewCard url="https://example.com" />);
    const iframe = screen.getByTestId("previewcard-iframe") as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.src).toContain("example.com");
  });

  it("has sandbox attribute", () => {
    render(<PreviewCard url="https://example.com" />);
    const iframe = screen.getByTestId("previewcard-iframe") as HTMLIFrameElement;
    expect(iframe.getAttribute("sandbox")).toBeTruthy();
  });

  it("displays title when provided", () => {
    render(<PreviewCard url="https://example.com" title="Test Page" />);
    expect(screen.getByTestId("previewcard").textContent).toContain("Test Page");
  });

  it("shows loading state initially", () => {
    render(<PreviewCard url="https://example.com" />);
    expect(screen.getByTestId("previewcard").textContent).toContain("Loading preview...");
  });

  it("applies className to root element", () => {
    render(<PreviewCard url="https://example.com" className="custom-pc" />);
    expect(screen.getByTestId("previewcard").className).toContain("custom-pc");
  });
});
