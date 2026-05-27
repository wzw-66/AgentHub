"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  api,
  storeTokens,
  clearTokens,
  storeUser,
  clearUser,
  getStoredAccessToken,
  getStoredUser,
} from "./api-client";

// ─── Types ────────────────────────────────────────────────────────────

interface User {
  id: string;
  username: string;
  email: string;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

// ─── Context ───────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ──────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // ─── Initialize from localStorage on mount ──────────────────────────
  useEffect(() => {
    const token = getStoredAccessToken();
    const storedUser = getStoredUser();
    if (token && storedUser) {
      setUser(storedUser);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{
      accessToken: string;
      refreshToken: string;
      user: { id: string; name: string; email: string };
    }>("/auth/login", { email, password }, { skipAuth: true });

    storeTokens(data.accessToken, data.refreshToken);
    // Map backend `name` to frontend `username`
    const mappedUser: User = {
      id: data.user.id,
      username: data.user.name,
      email: data.user.email,
    };
    storeUser(mappedUser);
    setUser(mappedUser);
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      // 注册成功后后端返回 user + tokens，前端直接忽略跳转到登录页
      await api.post<Record<string, unknown>>(
        "/auth/register",
        { name, email, password },
        { skipAuth: true },
      );
    },
    [],
  );

  const logout = useCallback(() => {
    clearTokens();
    clearUser();
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
