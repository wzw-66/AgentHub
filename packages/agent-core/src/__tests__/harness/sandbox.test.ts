import { describe, it, expect } from "vitest";
import { LocalSandbox } from "../../harness/sandbox/local-sandbox.js";
import { SandboxManager } from "../../harness/sandbox/sandbox-provider.js";
import type { SandboxProvider } from "../../harness/sandbox/types.js";

describe("LocalSandbox", () => {
  const sandbox = new LocalSandbox(process.cwd());

  it("should execute a command and return result", async () => {
    const result = await sandbox.exec(
      process.platform === "win32" ? "cmd" : "echo",
      process.platform === "win32" ? ["/c", "echo", "hello"] : ["hello"],
    );
    expect(result.stdout).toBe("hello");
    expect(result.exitCode).toBe(0);
  });

  it("should handle non-zero exit code", async () => {
    const result = await sandbox.exec(
      process.platform === "win32" ? "cmd" : "false",
      process.platform === "win32" ? ["/c", "exit", "1"] : [],
    );
    expect(result.exitCode).toBe(1);
  });

  it("should reject path traversal attempts", async () => {
    await expect(
      sandbox.readFile("../etc/passwd"),
    ).rejects.toThrow("Path traversal denied");
  });

  it("should list directory contents", async () => {
    const entries = await sandbox.listDir(".");
    expect(entries.length).toBeGreaterThan(0);
  });

  it("should return empty array for non-existent directory", async () => {
    const entries = await sandbox.listDir("nonexistent_dir_xyz");
    expect(entries).toEqual([]);
  });

  it("should write and read a file", async () => {
    const testPath = ".harness-test-temp.txt";
    try {
      await sandbox.writeFile(testPath, "test content");
      const content = await sandbox.readFile(testPath);
      expect(content).toBe("test content");
    } finally {
      // Cleanup
      try { await sandbox.exec("rm", ["-f", testPath]); } catch { /* ignore */ }
    }
  });

  it("should write binary content via updateFile", async () => {
    const testPath = ".harness-test-binary.bin";
    try {
      const encoder = new TextEncoder();
      const content = encoder.encode("binary\x00data");
      await sandbox.updateFile(testPath, content);
      const result = await sandbox.readFile(testPath);
      expect(result).toBe("binary\x00data");
    } finally {
      try { await sandbox.exec("rm", ["-f", testPath]); } catch { /* ignore */ }
    }
  });

  it("should reverse-resolve local paths to virtual paths", async () => {
    const localPath = process.cwd();
    const virtual = sandbox.reverseResolvePath(localPath);
    expect(virtual).toBe(".");
  });

  it("should reverse-resolve nested local paths", async () => {
    const srcDir = `${process.cwd()}/src`;
    const virtual = sandbox.reverseResolvePath(srcDir);
    expect(virtual).toBe("src");
  });
});

describe("SandboxManager", () => {
  it("should throw when no provider configured", async () => {
    const manager = new SandboxManager();
    await expect(manager.getSandbox()).rejects.toThrow("No SandboxProvider configured");
  });

  it("should acquire sandbox via provider", async () => {
    const mockSandbox = {
      exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      readFile: async () => "",
      writeFile: async () => {},
      updateFile: async () => {},
      listDir: async () => [],
    };

    const provider: SandboxProvider = {
      acquire: async () => "mock-1",
      get: async (id: string) => id === "mock-1" ? mockSandbox : null,
      release: async () => {},
    };

    const manager = new SandboxManager(provider);
    const sb = await manager.getSandbox("test");
    expect(sb).toBe(mockSandbox);
  });

  it("should cache sandbox instances by thread", async () => {
    let acquireCount = 0;
    const sandbox = {
      exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      readFile: async () => "",
      writeFile: async () => {},
      updateFile: async () => {},
      listDir: async () => [],
    };

    const provider: SandboxProvider = {
      acquire: async () => { acquireCount++; return "cached-1"; },
      get: async () => sandbox,
      release: async () => {},
    };

    const manager = new SandboxManager(provider);
    await manager.getSandbox("cached");
    await manager.getSandbox("cached");

    expect(acquireCount).toBe(1);
  });

  it("should set provider after construction", async () => {
    const manager = new SandboxManager();
    const provider: SandboxProvider = {
      acquire: async () => "late-1",
      get: async () => ({
        exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
        readFile: async () => "",
        writeFile: async () => {},
        updateFile: async () => {},
        listDir: async () => [],
      }),
      release: async () => {},
    };
    manager.setProvider(provider);

    const sb = await manager.getSandbox();
    expect(sb).toBeDefined();
  });

  it("should destroy all sandboxes", async () => {
    let released = false;
    const provider: SandboxProvider = {
      acquire: async () => "destroy-all-1",
      get: async () => ({
        exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
        readFile: async () => "",
        writeFile: async () => {},
        updateFile: async () => {},
        listDir: async () => [],
      }),
      release: async () => { released = true; },
    };

    const manager = new SandboxManager(provider);
    await manager.getSandbox("to-destroy");
    await manager.destroyAll();

    expect(released).toBe(true);
  });
});
