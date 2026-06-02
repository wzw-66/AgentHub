import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolRegistry } from "../../harness/tools/registry.js";
import type { ToolExecutionContext } from "../../harness/types.js";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn().mockReturnValue("file content"),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue(["a.txt", "b.txt"]),
  existsSync: vi.fn().mockReturnValue(true),
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn().mockReturnValue("command output"),
}));

describe("ToolRegistry", () => {
  const mockSandbox = {
    exec: vi.fn().mockResolvedValue({ stdout: "cmd result", stderr: "", exitCode: 0 }),
    readFile: vi.fn().mockResolvedValue("file data"),
    writeFile: vi.fn().mockResolvedValue(undefined),
    listDir: vi.fn().mockResolvedValue(["a.txt", "b.txt"]),
  };

  const baseContext: ToolExecutionContext = {
    conversationId: "conv-1",
  };

  it("should register and look up a tool", () => {
    const registry = new ToolRegistry();
    registry.registerHandler("my_tool", "My custom tool", async () => "result");

    expect(registry.has("my_tool")).toBe(true);
    expect(registry.get("my_tool")?.description).toBe("My custom tool");
  });

  it("should return undefined for unknown tool", () => {
    const registry = new ToolRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
    expect(registry.has("nonexistent")).toBe(false);
  });

  it("should execute a registered tool", async () => {
    const registry = new ToolRegistry();
    registry.registerHandler("echo", "Echo input", async (args) => {
      return `echo: ${args.text}`;
    });

    const result = await registry.execute("echo", { text: "hello" }, baseContext);
    expect(result).toBe("echo: hello");
  });

  it("should throw for unknown tool execution", async () => {
    const registry = new ToolRegistry();
    await expect(
      registry.execute("unknown", {}, baseContext),
    ).rejects.toThrow("Unknown tool: unknown");
  });

  it("should remove a tool", () => {
    const registry = new ToolRegistry();
    registry.registerHandler("temp", "Temporary", async () => "");
    expect(registry.has("temp")).toBe(true);

    registry.remove("temp");
    expect(registry.has("temp")).toBe(false);
  });

  it("should get all registered tools", () => {
    const registry = new ToolRegistry();
    registry.registerHandler("a", "Tool A", async () => "");
    registry.registerHandler("b", "Tool B", async () => "");

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.name)).toEqual(["a", "b"]);
  });

  it("should register built-in tools when sandbox is provided", () => {
    const registry = new ToolRegistry(mockSandbox);

    expect(registry.has("execute_command")).toBe(true);
    expect(registry.has("read_file")).toBe(true);
    expect(registry.has("write_file")).toBe(true);
    expect(registry.has("list_dir")).toBe(true);
  });

  it("should execute built-in execute_command via sandbox", async () => {
    const registry = new ToolRegistry(mockSandbox);

    const result = await registry.execute("execute_command", { command: "ls" }, baseContext);

    expect(mockSandbox.exec).toHaveBeenCalledWith("ls", []);
    expect(result).toContain("cmd result");
  });

  it("should execute built-in read_file via sandbox", async () => {
    const registry = new ToolRegistry(mockSandbox);

    const result = await registry.execute("read_file", { path: "/test.txt" }, baseContext);

    expect(mockSandbox.readFile).toHaveBeenCalledWith("/test.txt");
    expect(result).toBe("file data");
  });

  it("should execute built-in write_file via sandbox", async () => {
    const registry = new ToolRegistry(mockSandbox);

    const result = await registry.execute("write_file", { path: "/test.txt", content: "data" }, baseContext);

    expect(mockSandbox.writeFile).toHaveBeenCalledWith("/test.txt", "data");
    expect(result).toContain("File written");
  });

  it("should set sandbox after construction", () => {
    const registry = new ToolRegistry();
    expect(registry.has("execute_command")).toBe(false);

    registry.setSandbox(mockSandbox);
    expect(registry.has("execute_command")).toBe(true);
  });

  it("should register tool with full Tool object", () => {
    const registry = new ToolRegistry();
    const handler = async () => "result";
    registry.register({ name: "full_tool", description: "Full tool", handler });

    expect(registry.get("full_tool")?.description).toBe("Full tool");
  });
});
