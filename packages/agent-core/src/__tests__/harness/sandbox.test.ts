import { describe, it, expect } from "vitest";
import { LocalSandbox } from "../../harness/sandbox/local-sandbox.js";
import { SandboxManager } from "../../harness/sandbox/sandbox-provider.js";

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
});

describe("SandboxManager", () => {
  it("should throw when no provider configured", async () => {
    const manager = new SandboxManager();
    await expect(manager.getSandbox()).rejects.toThrow("No SandboxProvider configured");
  });

  it("should create sandbox via provider", async () => {
    const mockSandbox = {
      exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      readFile: async () => "",
      writeFile: async () => {},
      listDir: async () => [],
    };

    const provider = {
      create: async () => mockSandbox,
      destroy: async () => {},
    };

    const manager = new SandboxManager(provider);
    const sb = await manager.getSandbox("test");
    expect(sb).toBe(mockSandbox);
  });

  it("should cache sandbox instances", async () => {
    let createCount = 0;
    const provider = {
      create: async () => {
        createCount++;
        return {
          exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
          readFile: async () => "",
          writeFile: async () => {},
          listDir: async () => [],
        };
      },
      destroy: async () => {},
    };

    const manager = new SandboxManager(provider);
    await manager.getSandbox("cached");
    await manager.getSandbox("cached");

    expect(createCount).toBe(1);
  });

  it("should set provider after construction", async () => {
    const manager = new SandboxManager();
    const provider = {
      create: async () => ({
        exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
        readFile: async () => "",
        writeFile: async () => {},
        listDir: async () => [],
      }),
      destroy: async () => {},
    };
    manager.setProvider(provider);

    const sb = await manager.getSandbox();
    expect(sb).toBeDefined();
  });

  it("should destroy all sandboxes", async () => {
    let destroyed = false;
    const provider = {
      create: async () => ({
        exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
        readFile: async () => "",
        writeFile: async () => {},
        listDir: async () => [],
      }),
      destroy: async () => { destroyed = true; },
    };

    const manager = new SandboxManager(provider);
    await manager.getSandbox("to-destroy");
    await manager.destroyAll();

    expect(destroyed).toBe(true);
  });
});
