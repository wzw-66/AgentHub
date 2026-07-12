import { describe, it, expect } from "vitest";
import type { DockerSandboxConfig } from "../../../harness/sandbox/docker-config.js";

describe("DockerSandboxConfig types", () => {
  it("should accept a minimal config", () => {
    const config: DockerSandboxConfig = {
      image: "docker/sandbox-templates:shell",
      workingDir: "/home/agent/workspace",
    };
    expect(config.image).toBe("docker/sandbox-templates:shell");
  });

  it("should accept a full config with all fields", () => {
    const config: DockerSandboxConfig = {
      image: "docker/sandbox-templates:shell",
      workingDir: "/home/agent/workspace",
      envVars: { NODE_ENV: "production" },
      memoryLimit: "512m",
      memoryReservation: "256m",
      memorySwap: "256m",
      cpuLimit: 1,
      cpuSet: "0-1",
      cpuShares: 1024,
      diskSize: "2gb",
      pidsLimit: 100,
      ulimits: { nofile: { soft: 1024, hard: 2048 } },
      ioReadBps: "50mb",
      ioWriteBps: "30mb",
      ioReadIops: 1000,
      ioWriteIops: 500,
      networkAccess: false,
      networkRules: [
        {
          direction: "egress",
          ip: "0.0.0.0/0",
          port: 443,
          protocol: "tcp",
          action: "allow",
        },
      ],
      dnsServers: ["8.8.8.8"],
      proxyConfig: {
        httpProxy: "http://proxy:8080",
        httpsProxy: "https://proxy:8443",
        noProxy: "localhost,127.0.0.1",
      },
      idleTimeout: 600000,
      containerStopTimeout: 10000,
      imagePullPolicy: "IfNotPresent",
    };
    expect(config.imagePullPolicy).toBe("IfNotPresent");
  });

  it("should validate ImagePullPolicy values", () => {
    const always: DockerSandboxConfig["imagePullPolicy"] = "Always";
    const ifNot: DockerSandboxConfig["imagePullPolicy"] = "IfNotPresent";
    const never: DockerSandboxConfig["imagePullPolicy"] = "Never";
    expect([always, ifNot, never]).toHaveLength(3);
  });
});
