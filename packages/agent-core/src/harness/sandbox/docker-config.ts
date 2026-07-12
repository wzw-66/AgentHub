/**
 * Resource ulimit configuration for Docker containers.
 */
export interface Ulimit {
  soft: number;
  hard: number;
}

/**
 * Network access rule for egress/ingress filtering.
 */
export interface NetworkRule {
  direction: "egress" | "ingress";
  ip: string;          // Target IP or CIDR (e.g. "0.0.0.0/0")
  port: number;        // Port (e.g. 443, or 0 for any)
  protocol: "tcp" | "udp" | "any";
  action: "allow" | "deny";
}

/**
 * Proxy configuration for outbound HTTP/HTTPS traffic.
 */
export interface ProxyConfig {
  httpProxy: string;
  httpsProxy: string;
  noProxy: string;
}

/**
 * Container image pull policy.
 * - Always: always pull before create
 * - IfNotPresent: only pull if image missing locally (default)
 * - Never: never pull, fail if missing
 */
export type ImagePullPolicy = "Always" | "IfNotPresent" | "Never";

/**
 * Configuration for an AioSandbox (Docker container) sandbox.
 *
 * Mirrors Docker create/host config options.
 * All fields except `image` and `workingDir` are optional
 * and fall back to sensible defaults.
 */
export interface DockerSandboxConfig {
  /** Container image (e.g. "docker/sandbox-templates:shell"). */
  image: string;
  /** Working directory inside the container. */
  workingDir: string;

  // ── Resource limits ──
  /** Memory hard limit (e.g. "512m"). */
  memoryLimit?: string;
  /** Memory soft limit (e.g. "256m"). */
  memoryReservation?: string;
  /** Swap limit (e.g. "256m", "-1" for unlimited, "0" to disable). */
  memorySwap?: string;
  /** CPU core limit (e.g. 1 for one core). */
  cpuLimit?: number;
  /** CPU affinity (e.g. "0-3" to pin to cores 0-3). */
  cpuSet?: string;
  /** CPU relative weight (default 1024). */
  cpuShares?: number;
  /** Root filesystem disk quota (e.g. "2gb"). */
  diskSize?: string;
  /** Maximum number of processes (prevents fork bomb). */
  pidsLimit?: number;
  /** Custom ulimit values. */
  ulimits?: Record<string, Ulimit>;
  /** Disk read throughput limit (e.g. "50mb"). */
  ioReadBps?: string;
  /** Disk write throughput limit (e.g. "30mb"). */
  ioWriteBps?: string;
  /** Disk read IOPS limit. */
  ioReadIops?: number;
  /** Disk write IOPS limit. */
  ioWriteIops?: number;

  // ── Network policy ──
  /** Whether the container has network access (boolean switch). */
  networkAccess?: boolean;
  /** Fine-grained network rules. */
  networkRules?: NetworkRule[];
  /** Custom DNS servers. */
  dnsServers?: string[];
  /** Proxy configuration. */
  proxyConfig?: ProxyConfig;

  // ── Environment ──
  /** Environment variables to set in the container. */
  envVars?: Record<string, string>;

  // ── Lifecycle ──
  /** Idle timeout in ms (default 600000 = 10 min). */
  idleTimeout?: number;
  /** Container stop timeout in ms (default 10000 = 10s). */
  containerStopTimeout?: number;
  /** Image pull policy (default "IfNotPresent"). */
  imagePullPolicy?: ImagePullPolicy;
}

/** Default values for DockerSandboxConfig. */
export const DEFAULT_DOCKER_CONFIG: DockerSandboxConfig = {
  image: "docker/sandbox-templates:shell",
  workingDir: "/home/agent/workspace",
  memoryLimit: "512m",
  memoryReservation: "256m",
  memorySwap: "256m",
  cpuLimit: 1,
  cpuShares: 1024,
  pidsLimit: 100,
  ulimits: {
    nofile: { soft: 1024, hard: 2048 },
  },
  networkAccess: false,
  idleTimeout: 600_000,
  containerStopTimeout: 10_000,
  imagePullPolicy: "IfNotPresent",
};
