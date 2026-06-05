// ─── API Base URL ─────────────────────────────────────────────────────

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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

// ─── Token Refresh ────────────────────────────────────────────────────

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      clearTokens();
      clearUser();
      return null;
    }
    const data = await res.json() as { accessToken: string };
    // Store new access token (refresh token stays the same)
    const storedRefresh = getStoredRefreshToken();
    if (storedRefresh) {
      storeTokens(data.accessToken, storedRefresh);
    }
    return data.accessToken;
  } catch {
    return null;
  }
}

async function getValidAccessToken(): Promise<string | null> {
  const token = getStoredAccessToken();
  if (!token) return null;

  // Try to decode and check expiry (best-effort)
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp - now < 30) {
      // Token expires in < 30 seconds, refresh proactively
      return await refreshAccessToken();
    }
  } catch {
    // Can't decode, just try using it
  }

  return token;
}

// ─── API Client ───────────────────────────────────────────────────────

async function apiFetch<T>(
  method: string,
  endpoint: string,
  body?: unknown,
): Promise<T> {
  // Refresh token proactively if needed
  let token = await getValidAccessToken();

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // If token expired, try refreshing and retry once
  if (res.status === 401) {
    const errData = await res.json().catch(() => ({}));
    if ((errData as { error?: string }).error === "token_expired") {
      // Avoid multiple concurrent refresh attempts
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = refreshAccessToken().finally(() => {
          isRefreshing = false;
          refreshPromise = null;
        });
      }

      const newToken = await (refreshPromise ?? refreshAccessToken());
      if (newToken) {
        // Retry with new token
        headers["Authorization"] = `Bearer ${newToken}`;
        const retryRes = await fetch(`${API_BASE_URL}${endpoint}`, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!retryRes.ok) {
          const retryErr = await retryRes.json().catch(() => ({}));
          throw new Error(
            (retryErr as { error?: string }).error || `HTTP ${retryRes.status}`,
          );
        }
        return retryRes.json();
      }

      // Refresh failed - clear auth state
      clearTokens();
      clearUser();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      throw new Error("token_expired");
    }
    throw new Error((errData as { error?: string }).error || `HTTP ${res.status}`);
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error((errData as { error?: string }).error || `HTTP ${res.status}`);
  }

  // Handle empty responses (e.g., 204 No Content)
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as unknown as T);
}

export const api = {
  get: <T>(endpoint: string) => apiFetch<T>("GET", endpoint),
  post: <T>(endpoint: string, data?: unknown) => apiFetch<T>("POST", endpoint, data),
  patch: <T>(endpoint: string, data?: unknown) => apiFetch<T>("PATCH", endpoint, data),
  delete: <T>(endpoint: string) => apiFetch<T>("DELETE", endpoint),
};
