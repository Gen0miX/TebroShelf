import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ScanButton } from "./ScanButton";
import * as useForceScanModule from "../hooks/useForceScan";
import * as toastModule from "@/shared/hooks/use-toast";
import * as authModule from "@/features/auth";

// Mock the useForceScan hook
vi.mock("../hooks/useForceScan");

// Mock the toast function
vi.mock("@/shared/hooks/use-toast");

// Mock the useAuth hook
vi.mock("@/features/auth", () => ({
  useAuth: vi.fn(),
}));

describe("ScanButton", () => {
  const mockMutate = vi.fn();
  const mockToast = vi.fn();

  const createQueryClient = () =>
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

  const renderScanButton = () => {
    const queryClient = createQueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <ScanButton />
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(toastModule.toast).mockImplementation(mockToast);
    // Default: mock admin user
    vi.mocked(authModule.useAuth).mockReturnValue({
      user: { id: 1, username: "admin", role: "admin" },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
  });

  // Task 9.2: Test button renders for admin user
  describe("Rendering", () => {
    it("should render Force Scan button", () => {
      vi.mocked(useForceScanModule.useForceScan).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any);

      renderScanButton();

      expect(screen.getByRole("button", { name: /Force Scan/i })).toBeInTheDocument();
    });

    it("should render with RefreshCw icon", () => {
      vi.mocked(useForceScanModule.useForceScan).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any);

      renderScanButton();

      const button = screen.getByRole("button", { name: /Force Scan/i });
      expect(button).toBeInTheDocument();
      // Check that button contains svg (lucide icon)
      expect(button.querySelector("svg")).toBeInTheDocument();
    });

    it("should be enabled when not scanning", () => {
      vi.mocked(useForceScanModule.useForceScan).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any);

      renderScanButton();

      const button = screen.getByRole("button", { name: /Force Scan/i });
      expect(button).not.toBeDisabled();
    });
  });

  // Task 9.3: Test button shows loading state during scan
  describe("Loading State", () => {
    it("should show 'Scanning...' text when scan is in progress", () => {
      vi.mocked(useForceScanModule.useForceScan).mockReturnValue({
        mutate: mockMutate,
        isPending: true,
      } as any);

      renderScanButton();

      expect(screen.getByRole("button", { name: /Scanning.../i })).toBeInTheDocument();
    });

    it("should disable button while scan is in progress", () => {
      vi.mocked(useForceScanModule.useForceScan).mockReturnValue({
        mutate: mockMutate,
        isPending: true,
      } as any);

      renderScanButton();

      const button = screen.getByRole("button", { name: /Scanning.../i });
      expect(button).toBeDisabled();
    });

    it("should animate icon while scanning", () => {
      vi.mocked(useForceScanModule.useForceScan).mockReturnValue({
        mutate: mockMutate,
        isPending: true,
      } as any);

      renderScanButton();

      const button = screen.getByRole("button", { name: /Scanning.../i });
      const icon = button.querySelector("svg");
      expect(icon).toHaveClass("animate-spin");
    });
  });

  // Task 9.4: Test success toast displayed after scan
  describe("Success Handling", () => {
    it("should call triggerScan when button is clicked", () => {
      vi.mocked(useForceScanModule.useForceScan).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any);

      renderScanButton();

      const button = screen.getByRole("button", { name: /Force Scan/i });
      fireEvent.click(button);

      expect(mockMutate).toHaveBeenCalled();
    });

    it("should display success toast with file count on success", async () => {
      let capturedCallbacks: any = {};

      vi.mocked(useForceScanModule.useForceScan).mockReturnValue({
        mutate: vi.fn((_, callbacks) => {
          capturedCallbacks = callbacks;
          // Simulate successful scan
          if (callbacks?.onSuccess) {
            callbacks.onSuccess({
              filesFound: 5,
              filesProcessed: 3,
              filesSkipped: 2,
              errors: 0,
              duration: 1234,
            });
          }
        }),
        isPending: false,
      } as any);

      renderScanButton();

      const button = screen.getByRole("button", { name: /Force Scan/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: "Scan complete",
          description: "3 new file(s) detected",
        });
      });
    });
  });

  // Task 9.5: Test error handling for failed scan
  describe("Error Handling", () => {
    it("should display 'scan in progress' toast for concurrent scan error", async () => {
      vi.mocked(useForceScanModule.useForceScan).mockReturnValue({
        mutate: vi.fn((_, callbacks) => {
          if (callbacks?.onError) {
            callbacks.onError(new Error("A scan is already in progress"));
          }
        }),
        isPending: false,
      } as any);

      renderScanButton();

      const button = screen.getByRole("button", { name: /Force Scan/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          variant: "destructive",
          title: "Scan in progress",
          description: "Please wait for the current scan to complete",
        });
      });
    });

    it("should display generic error toast for other errors", async () => {
      const errorMessage = "Network error";

      vi.mocked(useForceScanModule.useForceScan).mockReturnValue({
        mutate: vi.fn((_, callbacks) => {
          if (callbacks?.onError) {
            callbacks.onError(new Error(errorMessage));
          }
        }),
        isPending: false,
      } as any);

      renderScanButton();

      const button = screen.getByRole("button", { name: /Force Scan/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          variant: "destructive",
          title: "Scan failed",
          description: errorMessage,
        });
      });
    });

    it("should handle API error response", async () => {
      vi.mocked(useForceScanModule.useForceScan).mockReturnValue({
        mutate: vi.fn((_, callbacks) => {
          if (callbacks?.onError) {
            callbacks.onError(new Error("Server error: Internal server error"));
          }
        }),
        isPending: false,
      } as any);

      renderScanButton();

      const button = screen.getByRole("button", { name: /Force Scan/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: "destructive",
            title: "Scan failed",
          })
        );
      });
    });
  });

  // Additional tests for edge cases
  describe("Edge Cases", () => {
    it("should not trigger scan when button is disabled", () => {
      vi.mocked(useForceScanModule.useForceScan).mockReturnValue({
        mutate: mockMutate,
        isPending: true, // Button is disabled during pending
      } as any);

      renderScanButton();

      const button = screen.getByRole("button", { name: /Scanning.../i });
      fireEvent.click(button);

      // mutate should not be called again since button is disabled
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it("should display zero files detected when no new files found", async () => {
      vi.mocked(useForceScanModule.useForceScan).mockReturnValue({
        mutate: vi.fn((_, callbacks) => {
          if (callbacks?.onSuccess) {
            callbacks.onSuccess({
              filesFound: 0,
              filesProcessed: 0,
              filesSkipped: 0,
              errors: 0,
              duration: 100,
            });
          }
        }),
        isPending: false,
      } as any);

      renderScanButton();

      const button = screen.getByRole("button", { name: /Force Scan/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: "Scan complete",
          description: "0 new file(s) detected",
        });
      });
    });
  });

  // AC #1: Only render for admin users
  describe("Admin-only visibility", () => {
    it("should not render for regular user", () => {
      vi.mocked(authModule.useAuth).mockReturnValue({
        user: { id: 2, username: "user", role: "user" },
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
      });

      vi.mocked(useForceScanModule.useForceScan).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any);

      renderScanButton();

      expect(screen.queryByRole("button", { name: /Force Scan/i })).not.toBeInTheDocument();
    });

    it("should not render when user is null", () => {
      vi.mocked(authModule.useAuth).mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
      });

      vi.mocked(useForceScanModule.useForceScan).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any);

      renderScanButton();

      expect(screen.queryByRole("button", { name: /Force Scan/i })).not.toBeInTheDocument();
    });

    it("should render for admin user", () => {
      vi.mocked(authModule.useAuth).mockReturnValue({
        user: { id: 1, username: "admin", role: "admin" },
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
      });

      vi.mocked(useForceScanModule.useForceScan).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any);

      renderScanButton();

      expect(screen.getByRole("button", { name: /Force Scan/i })).toBeInTheDocument();
    });
  });
});
