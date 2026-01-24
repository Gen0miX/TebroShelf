import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { useAuth } from "./useAuth";
import { AuthProvider } from "../context/AuthContext";
import * as authApi from "../api/authApi";

// Mock the authApi module
vi.mock("../api/authApi");

const wrapper = ({ children }: { children: ReactNode }) =>
  AuthProvider({ children });

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw error when used outside AuthProvider", () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow("useAuth must be used within an AuthProvider");

    consoleSpy.mockRestore();
  });

  it("should return auth context when used within AuthProvider", async () => {
    vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce(null);
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(result.current).toBeDefined();
    expect(result.current).toHaveProperty("user");
    expect(result.current).toHaveProperty("isAuthenticated");
    expect(result.current).toHaveProperty("isLoading");
    expect(result.current).toHaveProperty("login");
    expect(result.current).toHaveProperty("logout");
  });

  it("should have isLoading as true initially", () => {
    vi.mocked(authApi.getCurrentUser).mockImplementationOnce(
      () => new Promise(() => {}), // Never resolves
    );
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isLoading).toBe(true);
  });

  it("should have user as null and isAuthenticated as false initially", () => {
    vi.mocked(authApi.getCurrentUser).mockImplementationOnce(
      () => new Promise(() => {}), // Never resolves
    );
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("should load current user on mount", async () => {
    const mockUser = { id: 1, username: "testuser", role: "user" as const };
    vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce(mockUser);

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    // Wait for effect to complete
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // After loading
    expect(result.current.isLoading).toBe(false);
    expect(result.current.user).toEqual(mockUser);
  });

  it("should set user to null if getCurrentUser fails", async () => {
    vi.mocked(authApi.getCurrentUser).mockRejectedValueOnce(
      new Error("Network error"),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("should call login API and update user on successful login", async () => {
    const mockUser = { id: 1, username: "testuser", role: "user" as const };
    vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce(null);
    vi.mocked(authApi.login).mockResolvedValueOnce(mockUser);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const credentials = { username: "testuser", password: "password123" };

    await act(async () => {
      await result.current.login(credentials);
    });

    expect(authApi.login).toHaveBeenCalledWith(credentials);
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("should call logout API and clear user on logout", async () => {
    const mockUser = { id: 1, username: "testuser", role: "user" as const };
    vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce(mockUser);
    vi.mocked(authApi.logout).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(result.current.user).toEqual(mockUser);

    await act(async () => {
      await result.current.logout();
    });

    expect(authApi.logout).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("should handle login failure and throw error", async () => {
    vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce(null);
    const loginError = new Error("Invalid credentials");
    vi.mocked(authApi.login).mockRejectedValueOnce(loginError);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const credentials = { username: "testuser", password: "wrongpassword" };

    await expect(
      act(async () => {
        await result.current.login(credentials);
      }),
    ).rejects.toThrow("Invalid credentials");
  });
});
