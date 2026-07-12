import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DockerSandboxConfig } from "../../../harness/sandbox/docker-config.js";
import { DEFAULT_DOCKER_CONFIG } from "../../../harness/sandbox/docker-config.js";
import { AioSandbox } from "../../../harness/sandbox/aio-sandbox.js";
import Docker from "dockerode";

// ─── Mock dockerode ────────────────────────────────────────────────────────────

vi.mock("dockerode", () => {
  const mockExec = vi.fn();
  const mockContainer = {
    exec: mockExec,
  };
  const MockDocker = vi.fn(() => ({
    modem: {
      demuxStream: vi.fn(),
    },
  }));
  return { default: MockDocker };
});

describe("AioSandbox", () => {
  let sandbox: AioSandbox;
  let mockContainer: Docker.Container;
  let mockDocker: Docker;

  beforeEach(() => {
    mockContainer = {
      exec: vi.fn(),
    } as unknown as Docker.Container;

    mockDocker = new Docker() as unknown as Docker;

    sandbox = new AioSandbox(
      mockDocker,
      mockContainer,
      "test-container-id",
      DEFAULT_DOCKER_CONFIG,
    );
  });

  describe("containerName", () => {
    it("should produce deterministic names", () => {
      const name1 = AioSandbox.containerName("thread-1");
      const name2 = AioSandbox.containerName("thread-1");
      expect(name1).toBe(name2);
    });

    it("should produce different names for different threads", () => {
      const name1 = AioSandbox.containerName("thread-a");
      const name2 = AioSandbox.containerName("thread-b");
      expect(name1).not.toBe(name2);
    });

    it("should start with the agenthub prefix", () => {
      const name = AioSandbox.containerName("test");
      expect(name).toMatch(/^agenthub-sandbox-/);
    });
  });

  describe("buildHostConfig", () => {
    it("should set NanoCpus from cpuLimit", () => {
      const config: DockerSandboxConfig = {
        image: "test",
        workingDir: "/tmp",
        cpuLimit: 2,
      };
      const hc = AioSandbox.buildHostConfig(config);
      expect(hc.NanoCpus).toBe(2_000_000_000);
    });

    it("should disable network when networkAccess is false", () => {
      const config: DockerSandboxConfig = {
        image: "test",
        workingDir: "/tmp",
        networkAccess: false,
      };
      const hc = AioSandbox.buildHostConfig(config);
      expect(hc.NetworkMode).toBe("none");
    });

    it("should enable bridge network when networkAccess is true", () => {
      const config: DockerSandboxConfig = {
        image: "test",
        workingDir: "/tmp",
        networkAccess: true,
      };
      const hc = AioSandbox.buildHostConfig(config);
      expect(hc.NetworkMode).toBe("bridge");
    });

    it("should set memory from memoryLimit string", () => {
      const config: DockerSandboxConfig = {
        image: "test",
        workingDir: "/tmp",
        memoryLimit: "256m",
      };
      const hc = AioSandbox.buildHostConfig(config);
      expect(hc.Memory).toBe(256 * 1024 * 1024);
    });

    it("should set ulimits", () => {
      const config: DockerSandboxConfig = {
        image: "test",
        workingDir: "/tmp",
        ulimits: { nofile: { soft: 512, hard: 1024 } },
      };
      const hc = AioSandbox.buildHostConfig(config);
      expect(hc.Ulimits).toEqual([
        { Name: "nofile", Soft: 512, Hard: 1024 },
      ]);
    });
  });

  describe("buildCreateConfig", () => {
    it("should include labels and sleep infinity command", () => {
      const config: DockerSandboxConfig = { image: "my-img", workingDir: "/work" };
      const cc = AioSandbox.buildCreateConfig("sandbox-test", config);
      expect(cc.Image).toBe("my-img");
      expect(cc.Cmd).toEqual(["sleep", "infinity"]);
      expect(cc.Labels?.["agenthub-managed"]).toBe("true");
    });

    it("should convert envVars to ENV array", () => {
      const config: DockerSandboxConfig = {
        image: "img",
        workingDir: "/work",
        envVars: { FOO: "bar", BAZ: "qux" },
      };
      const cc = AioSandbox.buildCreateConfig("sandbox-env", config);
      expect(cc.Env).toContain("FOO=bar");
      expect(cc.Env).toContain("BAZ=qux");
    });
  });
});

describe("parseDockerMemory (internal)", () => {
  // Import via dynamic access — test the exported result indirectly via buildHostConfig
  it("should handle byte values", () => {
    const config: DockerSandboxConfig = { image: "t", workingDir: "/t", memoryLimit: "512" };
    const hc = AioSandbox.buildHostConfig(config);
    expect(hc.Memory).toBe(512);
  });

  it("should handle KB values", () => {
    const config: DockerSandboxConfig = { image: "t", workingDir: "/t", memoryLimit: "1k" };
    const hc = AioSandbox.buildHostConfig(config);
    expect(hc.Memory).toBe(1024);
  });

  it("should handle GB values", () => {
    const config: DockerSandboxConfig = { image: "t", workingDir: "/t", memoryLimit: "1gb" };
    const hc = AioSandbox.buildHostConfig(config);
    expect(hc.Memory).toBe(1073741824);
  });
});
