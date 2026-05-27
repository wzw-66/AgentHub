// ─── Types ────────────────────────────────────────────────────────────

interface ApiClientConfig {
  baseUrl: string;
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  onTokenRefreshed: (accessToken: string, refreshToken: string) => void;
  onAuthFailure: () => void;
}

interface ApiError {
  status: number;
  message: string;
  code?: string;
}

// ─── Token storage helpers (localStorage) ─────────────────────────────

const STORAGE_KEYS = {
  ACCESS_TOKEN: "agenthub_access_token",
  REFRESH_TOKEN: "agenthub_refresh_token",
} as const;

export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
}

export function storeTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
  localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
}

export function getStoredUser(): { id: string; username: string; email: string } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("agenthub_user");
  return raw ? JSON.parse(raw) : null;
}

export function storeUser(user: { id: string; username: string; email: string }): void {
  localStorage.setItem("agenthub_user", JSON.stringify(user));
}

export function clearUser(): void {
  localStorage.removeItem("agenthub_user");
}

// ─── API Client ───────────────────────────────────────────────────────

const defaultConfig: ApiClientConfig = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8123",
  getAccessToken: getStoredAccessToken,
  getRefreshToken: getStoredRefreshToken,
  onTokenRefreshed: (accessToken, refreshToken) => {
    storeTokens(accessToken, refreshToken);
  },
  onAuthFailure: () => {
    // Avoid redirect loop: if already on /login or /register, just clear state
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/register")) {
      window.location.href = "/login";
    }
  },
};

let config: ApiClientConfig = { ...defaultConfig };

export function configureApiClient(overrides: Partial<ApiClientConfig>): void {
  config = { ...config, ...overrides };
}

// ─── Request helpers ──────────────────────────────────────────────────

function buildUrl(path: string): string {
  const base = config.baseUrl.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    let message: string;
    try {
      const parsed = JSON.parse(body);
      message = parsed.message || parsed.error || response.statusText;
    } catch {
      message = body || response.statusText;
    }
    const error: ApiError = {
      status: response.status,
      message,
    };
    throw error;
  }
  return response.json() as Promise<T>;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts?: { skipAuth?: boolean },
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!opts?.skipAuth) {
    const token = config.getAccessToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const response = await fetch(buildUrl(path), {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  // ─── Token refresh on 401 ──────────────────────────────────────
  if (response.status === 401 && !opts?.skipAuth) {
    const refreshed = await attemptTokenRefresh();
    if (refreshed) {
      // Retry with new token
      const retryToken = config.getAccessToken();
      if (retryToken) {
        headers["Authorization"] = `Bearer ${retryToken}`;
      }
      const retryResponse = await fetch(buildUrl(path), {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
      });
      return handleResponse<T>(retryResponse);
    }
    config.onAuthFailure();
    throw { status: 401, message: "Authentication failed" } as ApiError;
  }

  return handleResponse<T>(response);
}

async function attemptTokenRefresh(): Promise<boolean> {
  const refreshToken = config.getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(buildUrl("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return false;

    const data = await response.json();
    config.onTokenRefreshed(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string, opts?: { skipAuth?: boolean }) =>
    request<T>("GET", path, undefined, opts),

  post: <T>(path: string, body?: unknown, opts?: { skipAuth?: boolean }) =>
    request<T>("POST", path, body, opts),

  patch: <T>(path: string, body?: unknown) =>
    request<T>("PATCH", path, body),

  delete: <T>(path: string) =>
    request<T>("DELETE", path),
};

export type { ApiClientConfig, ApiError };
