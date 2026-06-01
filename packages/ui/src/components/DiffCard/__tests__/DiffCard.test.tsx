import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiffCard } from "../DiffCard.js";

afterEach(cleanup);

const sampleDiff = `--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 const a = 1;
-const b = 2;
+const b = 3;
 const c = 4;
`;

describe("DiffCard", () => {
  it("renders added lines with green styling", () => {
    render(<DiffCard diff={sampleDiff} />);
    const addLine = screen.getByTestId("diff-line-5");
    expect(addLine.textContent).toBe("+const b = 3;");
  });

  it("renders removed lines with red styling", () => {
    render(<DiffCard diff={sampleDiff} />);
    const removeLine = screen.getByTestId("diff-line-4");
    expect(removeLine.textContent).toBe("-const b = 2;");
  });

  it("renders context lines without highlight", () => {
    render(<DiffCard diff={sampleDiff} />);
    const contextLine = screen.getByTestId("diff-line-3");
    expect(contextLine.textContent).toBe(" const a = 1;");
  });

  it("displays title", () => {
    render(<DiffCard diff={sampleDiff} title="File: test.ts" />);
    expect(screen.getByTestId("diffcard").textContent).toContain("File: test.ts");
  });

  it("handles empty diff with placeholder", () => {
    render(<DiffCard diff="" />);
    expect(screen.getByTestId("diffcard").textContent).toContain("No changes");
  });

  it("shows apply button when onApply is provided", () => {
    render(<DiffCard diff={sampleDiff} title="file.ts" onApply={() => {}} />);
    expect(screen.getByTestId("diff-apply-btn")).toBeInTheDocument();
  });

  it("calls onApply with diff content when clicked", async () => {
    const onApply = vi.fn();
    render(<DiffCard diff={sampleDiff} title="file.ts" onApply={onApply} />);
    await userEvent.click(screen.getByTestId("diff-apply-btn"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(sampleDiff);
  });

  it("does not render apply button without onApply", () => {
    render(<DiffCard diff={sampleDiff} title="file.ts" />);
    expect(screen.queryByTestId("diff-apply-btn")).not.toBeInTheDocument();
  });
});
