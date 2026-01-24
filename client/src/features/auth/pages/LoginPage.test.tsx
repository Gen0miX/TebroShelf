import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { LoginPage } from "./LoginPage";
import { AuthProvider } from "../context/AuthContext";
import * as authApi from "../api/authApi";
import * as toastModule from "@/hooks/use-toast";

// Mock modules
vi.mock("../api/authApi");
vi.mock("@/hooks/use-toast");

describe("LoginPage", () => {
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(toastModule.toast).mockImplementation(mockToast);
  });

  const renderLoginPage = () => {
    return render(
      <BrowserRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </BrowserRouter>,
    );
  };

  describe("Rendering", () => {
    it("should render login form with username and password inputs", async () => {
      vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce(null);

      renderLoginPage();

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Nom d'utilisateur"),
        ).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Mot de passe")).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: /Se connecter/i }),
        ).toBeInTheDocument();
      });
    });

    it("should display loading state while checking session", () => {
      vi.mocked(authApi.getCurrentUser).mockImplementationOnce(
        () => new Promise(() => {}), // Never resolves
      );

      const { container } = renderLoginPage();

      expect(container.textContent).toContain("Chargement...");
    });

    it("should display TebroShelf title", async () => {
      vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce(null);

      renderLoginPage();

      await waitFor(() => {
        expect(screen.getByText("TebroShelf")).toBeInTheDocument();
      });
    });
  });

  describe("AC 10.3: Login success flow", () => {
    it("should submit login form and navigate on success", async () => {
      const mockUser = { id: 1, username: "testuser", role: "user" as const };
      vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce(null);
      vi.mocked(authApi.login).mockResolvedValueOnce(mockUser);

      renderLoginPage();

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Nom d'utilisateur"),
        ).toBeInTheDocument();
      });

      const usernameInput = screen.getByPlaceholderText("Nom d'utilisateur");
      const passwordInput = screen.getByPlaceholderText("Mot de passe");
      const submitButton = screen.getByRole("button", {
        name: /Se connecter/i,
      });

      fireEvent.change(usernameInput, { target: { value: "testuser" } });
      fireEvent.change(passwordInput, { target: { value: "password123" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(authApi.login).toHaveBeenCalledWith({
          username: "testuser",
          password: "password123",
        });
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Connexion réussie",
            description: "Bienvenue testuser",
          }),
        );
      });
    });

    it("should disable submit button while submitting", async () => {
      const mockUser = { id: 1, username: "testuser", role: "user" as const };
      vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce(null);
      vi.mocked(authApi.login).mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve(mockUser), 50)),
      );

      renderLoginPage();

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Nom d'utilisateur"),
        ).toBeInTheDocument();
      });

      const usernameInput = screen.getByPlaceholderText("Nom d'utilisateur");
      const passwordInput = screen.getByPlaceholderText("Mot de passe");
      const submitButton = screen.getByRole("button", {
        name: /Se connecter/i,
      });

      fireEvent.change(usernameInput, { target: { value: "testuser" } });
      fireEvent.change(passwordInput, { target: { value: "password123" } });
      fireEvent.click(submitButton);

      // Button should show "Connexion..." while submitting
      expect(submitButton).toBeDisabled();
      expect(submitButton).toHaveTextContent("Connexion...");
    });
  });

  describe("AC 10.4: Login failure shows toast", () => {
    it("should display error toast when login fails", async () => {
      vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce(null);
      vi.mocked(authApi.login).mockRejectedValueOnce(
        new Error("Identifiants invalides"),
      );

      renderLoginPage();

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Nom d'utilisateur"),
        ).toBeInTheDocument();
      });

      const usernameInput = screen.getByPlaceholderText("Nom d'utilisateur");
      const passwordInput = screen.getByPlaceholderText("Mot de passe");
      const submitButton = screen.getByRole("button", {
        name: /Se connecter/i,
      });

      fireEvent.change(usernameInput, { target: { value: "testuser" } });
      fireEvent.change(passwordInput, { target: { value: "wrongpassword" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erreur de connexion",
            description: "Identifiants invalides",
            variant: "destructive",
          }),
        );
      });
    });

    it("should display generic error message when error object is not Error instance", async () => {
      vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce(null);
      vi.mocked(authApi.login).mockRejectedValueOnce("Unknown error");

      renderLoginPage();

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Nom d'utilisateur"),
        ).toBeInTheDocument();
      });

      const usernameInput = screen.getByPlaceholderText("Nom d'utilisateur");
      const passwordInput = screen.getByPlaceholderText("Mot de passe");
      const submitButton = screen.getByRole("button", {
        name: /Se connecter/i,
      });

      fireEvent.change(usernameInput, { target: { value: "testuser" } });
      fireEvent.change(passwordInput, { target: { value: "password123" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erreur de connexion",
            description: "Identifiants invalides",
            variant: "destructive",
          }),
        );
      });
    });

    it("should allow form resubmission after error", async () => {
      vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce(null);
      vi.mocked(authApi.login)
        .mockRejectedValueOnce(new Error("Identifiants invalides"))
        .mockResolvedValueOnce({
          id: 1,
          username: "testuser",
          role: "user" as const,
        });

      renderLoginPage();

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Nom d'utilisateur"),
        ).toBeInTheDocument();
      });

      const usernameInput = screen.getByPlaceholderText("Nom d'utilisateur");
      const passwordInput = screen.getByPlaceholderText("Mot de passe");
      const submitButton = screen.getByRole("button", {
        name: /Se connecter/i,
      });

      // First attempt fails
      fireEvent.change(usernameInput, { target: { value: "testuser" } });
      fireEvent.change(passwordInput, { target: { value: "wrongpassword" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Erreur de connexion",
          }),
        );
      });

      // Clear mocks and reset inputs
      vi.clearAllMocks();

      // Second attempt succeeds
      fireEvent.change(usernameInput, { target: { value: "testuser" } });
      fireEvent.change(passwordInput, { target: { value: "correctpassword" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(authApi.login).toHaveBeenCalledWith({
          username: "testuser",
          password: "correctpassword",
        });
      });
    });
  });

  describe("AC 10.5: Protected route redirects when not authenticated", () => {
    it("should render login page when user is not authenticated", async () => {
      vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce(null);

      renderLoginPage();

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Nom d'utilisateur"),
        ).toBeInTheDocument();
      });
    });

    it("should redirect to home when user is already authenticated", async () => {
      const mockUser = { id: 1, username: "testuser", role: "user" as const };
      vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce(mockUser);

      const { container } = render(
        <BrowserRouter>
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        </BrowserRouter>,
      );

      // Component should navigate away, so login form should not be visible
      await waitFor(() => {
        expect(
          screen.queryByPlaceholderText("Nom d'utilisateur"),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("AC 10.6: Session persistence on refresh", () => {
    it("should persist user session when page loads with authenticated user", async () => {
      const mockUser = {
        id: 1,
        username: "persisteduser",
        role: "user" as const,
      };
      vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce(mockUser);

      const { container } = render(
        <BrowserRouter>
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        </BrowserRouter>,
      );

      // Should redirect instead of showing login form
      await waitFor(() => {
        expect(
          screen.queryByPlaceholderText("Nom d'utilisateur"),
        ).not.toBeInTheDocument();
      });

      expect(authApi.getCurrentUser).toHaveBeenCalled();
    });

    it("should clear session when getCurrentUser fails", async () => {
      vi.mocked(authApi.getCurrentUser).mockRejectedValueOnce(
        new Error("Session expired"),
      );

      renderLoginPage();

      await waitFor(() => {
        // Login form should be visible because user is not authenticated
        expect(
          screen.getByPlaceholderText("Nom d'utilisateur"),
        ).toBeInTheDocument();
      });
    });

    it("should load login form when session is cleared", async () => {
      vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce(null);

      renderLoginPage();

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Nom d'utilisateur"),
        ).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Mot de passe")).toBeInTheDocument();
      });
    });
  });
});
