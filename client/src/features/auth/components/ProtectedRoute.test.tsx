import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { AuthContext } from "../context/AuthContext";
import type { AuthContextType, User } from "../types/auth";

describe("ProtectedRoute", () => {
  const mockUser: User = { id: 1, username: "testuser", role: "user" };

  const createMockAuthContext = (
    overrides: Partial<AuthContextType> = {}
  ): AuthContextType => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  });

  const renderWithAuth = (
    authValue: AuthContextType,
    initialRoute: string = "/"
  ) => {
    return render(
      <AuthContext.Provider value={authValue}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <Routes>
            <Route path="/login" element={<div>Login Page</div>} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <div>Protected Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Loading state", () => {
    it("should show loading spinner when isLoading is true", () => {
      const authValue = createMockAuthContext({ isLoading: true });
      const { container } = renderWithAuth(authValue);

      // Check for the spinner element
      const spinner = container.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });

    it("should not show protected content while loading", () => {
      const authValue = createMockAuthContext({ isLoading: true });
      renderWithAuth(authValue);

      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    });
  });

  describe("Unauthenticated state", () => {
    it("should redirect to /login when not authenticated", () => {
      const authValue = createMockAuthContext({
        isAuthenticated: false,
        isLoading: false,
      });
      renderWithAuth(authValue);

      expect(screen.getByText("Login Page")).toBeInTheDocument();
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    });

    it("should not show protected content when not authenticated", () => {
      const authValue = createMockAuthContext({
        isAuthenticated: false,
        isLoading: false,
      });
      renderWithAuth(authValue);

      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    });
  });

  describe("Authenticated state", () => {
    it("should render children when authenticated", () => {
      const authValue = createMockAuthContext({
        user: mockUser,
        isAuthenticated: true,
        isLoading: false,
      });
      renderWithAuth(authValue);

      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });

    it("should not redirect to login when authenticated", () => {
      const authValue = createMockAuthContext({
        user: mockUser,
        isAuthenticated: true,
        isLoading: false,
      });
      renderWithAuth(authValue);

      expect(screen.queryByText("Login Page")).not.toBeInTheDocument();
    });
  });
});
