import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import LoginPage from "@/app/(auth)/login/page";
import RegisterPage from "@/app/(auth)/register/page";

// ─── Mocks ──────────────────────────────────────────────────────────────

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useParams: () => ({}),
}));

const mockLogin = vi.fn();
const mockRegister = vi.fn();

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    login: mockLogin,
    register: mockRegister,
    logout: vi.fn(),
  }),
}));

// ─── LoginPage Tests ────────────────────────────────────────────────────

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders login form with title and fields", () => {
    render(<LoginPage />);

    expect(screen.getByText("登录 AgentHub")).toBeInTheDocument();
    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  it("shows link to register page", () => {
    render(<LoginPage />);

    const registerLink = screen.getByText("注册");
    expect(registerLink).toBeInTheDocument();
    expect(registerLink.closest("a")).toHaveAttribute("href", "/register");
  });

  it("calls login and redirects on successful submit", async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("test@example.com", "password123");
    });
    expect(mockPush).toHaveBeenCalledWith("/chat");
  });

  it("shows error message on login failure", async () => {
    mockLogin.mockRejectedValueOnce({ message: "邮箱或密码错误" });
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "wrong@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getByText("邮箱或密码错误")).toBeInTheDocument();
    });
  });

  it("shows generic error message when no message provided", async () => {
    mockLogin.mockRejectedValueOnce({});
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getByText("登录失败，请重试")).toBeInTheDocument();
    });
  });

  it("disables button while loading", async () => {
    // Keep promise pending to simulate loading
    mockLogin.mockImplementationOnce(() => new Promise(() => {}));
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(screen.getByRole("button", { name: "登录中..." })).toBeDisabled();
  });
});

// ─── RegisterPage Tests ─────────────────────────────────────────────────

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders register form with all fields", () => {
    render(<RegisterPage />);

    expect(screen.getByText("注册 AgentHub")).toBeInTheDocument();
    expect(screen.getByLabelText("名称")).toBeInTheDocument();
    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "注册" })).toBeInTheDocument();
  });

  it("shows link to login page", () => {
    render(<RegisterPage />);

    const loginLink = screen.getByText("登录");
    expect(loginLink).toBeInTheDocument();
    expect(loginLink.closest("a")).toHaveAttribute("href", "/login");
  });

  it("calls register and redirects on successful submit", async () => {
    mockRegister.mockResolvedValueOnce(undefined);
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText("名称"), {
      target: { value: "TestUser" },
    });
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        "TestUser",
        "test@example.com",
        "password123",
      );
    });
    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  it("shows error message on registration failure", async () => {
    mockRegister.mockRejectedValueOnce({ message: "邮箱已被注册" });
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText("名称"), {
      target: { value: "TestUser" },
    });
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "used@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    await waitFor(() => {
      expect(screen.getByText("邮箱已被注册")).toBeInTheDocument();
    });
  });

  it("shows translated error for 'Invalid input'", async () => {
    mockRegister.mockRejectedValueOnce({ message: "Invalid input" });
    const { container } = render(<RegisterPage />);

    const nameInput = screen.getByLabelText("名称");
    const emailInput = screen.getByLabelText("邮箱");
    const passwordInput = screen.getByLabelText("密码");

    fireEvent.change(nameInput, { target: { value: "" } });
    fireEvent.change(emailInput, { target: { value: "bad" } });
    fireEvent.change(passwordInput, { target: { value: "short" } });

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(
        screen.getByText(
          "输入有误，请检查：名称不能为空、邮箱格式正确、密码至少 8 位",
        ),
      ).toBeInTheDocument();
    });
  });

  it("shows generic error when API fails without message", async () => {
    mockRegister.mockRejectedValueOnce({});
    const { container } = render(<RegisterPage />);

    const nameInput = screen.getByLabelText("名称");
    const emailInput = screen.getByLabelText("邮箱");
    const passwordInput = screen.getByLabelText("密码");

    fireEvent.change(nameInput, { target: { value: "TestUser" } });
    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText("注册失败，请重试")).toBeInTheDocument();
    });
  });

  it("disables button while loading", async () => {
    mockRegister.mockImplementationOnce(() => new Promise(() => {}));
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText("名称"), {
      target: { value: "TestUser" },
    });
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    expect(screen.getByRole("button", { name: "注册中..." })).toBeDisabled();
  });
});

// ─── Token Refresh Tests ────────────────────────────────────────────────
// Import api-client directly (not mocked) for token/interceptor tests
import {
  storeTokens,
  clearTokens,
  getStoredAccessToken,
  getStoredRefreshToken,
  api,
  configureApiClient,
} from "@/lib/api-client";

describe("Token refresh interceptor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores and retrieves tokens from localStorage", () => {
    storeTokens("access-123", "refresh-456");
    expect(getStoredAccessToken()).toBe("access-123");
    expect(getStoredRefreshToken()).toBe("refresh-456");
  });

  it("clears tokens from localStorage", () => {
    storeTokens("access-123", "refresh-456");
    clearTokens();
    expect(getStoredAccessToken()).toBeNull();
  });

  it("attempts token refresh on 401 and retries request", async () => {
    localStorage.setItem("agenthub_access_token", "expired-token");
    localStorage.setItem("agenthub_refresh_token", "valid-refresh");

    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce(
        new Response(null, { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "new-token",
            refreshToken: "new-refresh",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: "success" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const result = await api.get("/api/test");

    expect(result).toEqual({ data: "success" });

    // Should have called refresh endpoint
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/auth/refresh"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("valid-refresh"),
      }),
    );

    // Should have retried with new token
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/api/test"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer new-token",
        }),
      }),
    );

    expect(localStorage.getItem("agenthub_access_token")).toBe("new-token");
    expect(localStorage.getItem("agenthub_refresh_token")).toBe("new-refresh");
  });

  it("calls onAuthFailure when refresh fails", async () => {
    const onAuthFailure = vi.fn();
    configureApiClient({ onAuthFailure });

    localStorage.setItem("agenthub_access_token", "expired-token");
    localStorage.setItem("agenthub_refresh_token", "expired-refresh");

    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));

    await expect(api.get("/api/test")).rejects.toThrow("Authentication failed");
    expect(onAuthFailure).toHaveBeenCalled();
  });
});
