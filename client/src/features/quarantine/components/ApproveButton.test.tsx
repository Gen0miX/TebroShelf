import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApproveButton } from "./ApproveButton";
import * as useApproveQuarantineModule from "../hooks/useApproveQuarantine";
import * as toastModule from "@/shared/hooks/use-toast";
import * as authModule from "@/features/auth";

// Mock the useApproveQuarantine hook
vi.mock("../hooks/useApproveQuarantine");

// Mock the toast function
vi.mock("@/shared/hooks/use-toast");

// Mock the useAuth hook
vi.mock("@/features/auth", () => ({
  useAuth: vi.fn(),
}));

describe("ApproveButton", () => {
  const mockMutate = vi.fn();
  const mockToast = vi.fn();

  const createQueryClient = () =>
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

  const renderApproveButton = (props = { bookId: 1, bookTitle: "Test Book" }) => {
    const queryClient = createQueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <ApproveButton {...props} />
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
    it("should render 'Move to Library' button for admin user", () => {
      vi.mocked(useApproveQuarantineModule.useApproveQuarantine).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any);

      renderApproveButton();

      expect(
        screen.getByRole("button", { name: /Move to Library/i })
      ).toBeInTheDocument();
    });

    it("should be enabled when not pending", () => {
      vi.mocked(useApproveQuarantineModule.useApproveQuarantine).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any);

      renderApproveButton();

      const button = screen.getByRole("button", { name: /Move to Library/i });
      expect(button).not.toBeDisabled();
    });
  });

  // Task 9.3: Test button does NOT render for regular user (AC #6)
  describe("Admin-only visibility", () => {
    it("should not render for regular user", () => {
      vi.mocked(authModule.useAuth).mockReturnValue({
        user: { id: 2, username: "user", role: "user" },
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
      });

      vi.mocked(useApproveQuarantineModule.useApproveQuarantine).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any);

      renderApproveButton();

      expect(
        screen.queryByRole("button", { name: /Move to Library/i })
      ).not.toBeInTheDocument();
    });

    it("should not render when user is null", () => {
      vi.mocked(authModule.useAuth).mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
      });

      vi.mocked(useApproveQuarantineModule.useApproveQuarantine).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any);

      renderApproveButton();

      expect(
        screen.queryByRole("button", { name: /Move to Library/i })
      ).not.toBeInTheDocument();
    });
  });

  // Task 9.4: Test button click triggers mutation with correct bookId
  describe("Mutation Triggering", () => {
    it("should call mutate with correct bookId when button is clicked", () => {
      vi.mocked(useApproveQuarantineModule.useApproveQuarantine).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any);

      renderApproveButton({ bookId: 42, bookTitle: "Test Book" });

      const button = screen.getByRole("button", { name: /Move to Library/i });
      fireEvent.click(button);

      expect(mockMutate).toHaveBeenCalledWith(42, expect.any(Object));
    });
  });

  // Task 9.5: Test button shows "Moving..." and is disabled when isPending
  describe("Loading State", () => {
    it("should show 'Moving...' text when approval is in progress", () => {
      vi.mocked(useApproveQuarantineModule.useApproveQuarantine).mockReturnValue({
        mutate: mockMutate,
        isPending: true,
      } as any);

      renderApproveButton();

      expect(
        screen.getByRole("button", { name: /Moving.../i })
      ).toBeInTheDocument();
    });

    it("should disable button while approval is in progress", () => {
      vi.mocked(useApproveQuarantineModule.useApproveQuarantine).mockReturnValue({
        mutate: mockMutate,
        isPending: true,
      } as any);

      renderApproveButton();

      const button = screen.getByRole("button", { name: /Moving.../i });
      expect(button).toBeDisabled();
    });
  });

  // Task 9.6: Test success toast displayed on successful approval (AC #9)
  describe("Success Handling", () => {
    it("should display success toast with book title on success", async () => {
      vi.mocked(useApproveQuarantineModule.useApproveQuarantine).mockReturnValue({
        mutate: vi.fn((_, callbacks) => {
          if (callbacks?.onSuccess) {
            callbacks.onSuccess({
              data: {
                id: 1,
                title: "Test Book",
                status: "enriched",
              },
            });
          }
        }),
        isPending: false,
      } as any);

      renderApproveButton({ bookId: 1, bookTitle: "My Awesome Book" });

      const button = screen.getByRole("button", { name: /Move to Library/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: "Moved to library",
          description: '"My Awesome Book" is now available in the library.',
        });
      });
    });
  });

  // Task 9.7: Test error toast displayed on failed approval
  describe("Error Handling", () => {
    it("should display error toast on approval failure", async () => {
      const errorMessage = "Book is not in quarantine";

      vi.mocked(useApproveQuarantineModule.useApproveQuarantine).mockReturnValue({
        mutate: vi.fn((_, callbacks) => {
          if (callbacks?.onError) {
            callbacks.onError(new Error(errorMessage));
          }
        }),
        isPending: false,
      } as any);

      renderApproveButton();

      const button = screen.getByRole("button", { name: /Move to Library/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          variant: "destructive",
          title: "Approval failed",
          description: errorMessage,
        });
      });
    });

    it("should handle network error", async () => {
      vi.mocked(useApproveQuarantineModule.useApproveQuarantine).mockReturnValue({
        mutate: vi.fn((_, callbacks) => {
          if (callbacks?.onError) {
            callbacks.onError(new Error("Network error"));
          }
        }),
        isPending: false,
      } as any);

      renderApproveButton();

      const button = screen.getByRole("button", { name: /Move to Library/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: "destructive",
            title: "Approval failed",
          })
        );
      });
    });
  });

  // Edge cases
  describe("Edge Cases", () => {
    it("should not trigger approval when button is disabled", () => {
      vi.mocked(useApproveQuarantineModule.useApproveQuarantine).mockReturnValue({
        mutate: mockMutate,
        isPending: true,
      } as any);

      renderApproveButton();

      const button = screen.getByRole("button", { name: /Moving.../i });
      fireEvent.click(button);

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it("should work with different bookId values", () => {
      vi.mocked(useApproveQuarantineModule.useApproveQuarantine).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any);

      renderApproveButton({ bookId: 999, bookTitle: "Another Book" });

      const button = screen.getByRole("button", { name: /Move to Library/i });
      fireEvent.click(button);

      expect(mockMutate).toHaveBeenCalledWith(999, expect.any(Object));
    });
  });
});
