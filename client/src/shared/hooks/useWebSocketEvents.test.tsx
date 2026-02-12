import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Mock dependencies
vi.mock("./useWebSocket", () => ({
  useWebSocket: vi.fn(() => ({ status: "connected" })),
}));

vi.mock("@/features/auth", () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: true })),
}));

vi.mock("@/shared/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

vi.mock("@/shared/providers/EnrichmentProgressContext", () => ({
  useEnrichmentProgress: vi.fn(() => ({
    updateEnrichment: vi.fn(),
    removeEnrichment: vi.fn(),
  })),
}));

// Import after mocks
import { useWebSocket } from "./useWebSocket";
import { useAuth } from "@/features/auth";
import { toast } from "@/shared/hooks/use-toast";
import { useEnrichmentProgress } from "@/shared/providers/EnrichmentProgressContext";
import { useWebSocketEvents } from "./useWebSocketEvents";

const mockUseWebSocket = vi.mocked(useWebSocket);
const mockUseAuth = vi.mocked(useAuth);
const mockToast = vi.mocked(toast);
const mockUseEnrichmentProgress = vi.mocked(useEnrichmentProgress);

describe("useWebSocketEvents", () => {
  let queryClient: QueryClient;
  let mockUpdateEnrichment: ReturnType<typeof vi.fn>;
  let mockRemoveEnrichment: ReturnType<typeof vi.fn>;
  let capturedOnMessage: ((event: MessageEvent) => void) | undefined;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    mockUpdateEnrichment = vi.fn();
    mockRemoveEnrichment = vi.fn();

    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { id: 1, username: "test", role: "admin" },
      login: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
    });

    mockUseEnrichmentProgress.mockReturnValue({
      activeEnrichments: [],
      hasActiveEnrichments: false,
      updateEnrichment: mockUpdateEnrichment,
      removeEnrichment: mockRemoveEnrichment,
    });

    // Capture the onMessage callback
    mockUseWebSocket.mockImplementation((_url, options) => {
      capturedOnMessage = options?.onMessage;
      return { status: "connected" as const };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createMessageEvent = (type: string, payload: unknown): MessageEvent => {
    return new MessageEvent("message", {
      data: JSON.stringify({
        type,
        payload,
        timestamp: new Date().toISOString(),
      }),
    });
  };

  describe("enrichment.started", () => {
    it("should update context and show toast when enrichment starts", () => {
      renderHook(() => useWebSocketEvents(), { wrapper });

      const event = createMessageEvent("enrichment.started", {
        bookId: 1,
        step: "started",
        details: { contentType: "book" },
      });

      act(() => {
        capturedOnMessage?.(event);
      });

      expect(mockUpdateEnrichment).toHaveBeenCalledWith(1, {
        currentStep: "started",
        status: "in-progress",
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: "Enrichment started",
        description: "Processing book #1...",
      });
    });
  });

  describe("enrichment.progress", () => {
    it("should update context without toast for progress events", () => {
      renderHook(() => useWebSocketEvents(), { wrapper });

      const event = createMessageEvent("enrichment.progress", {
        bookId: 1,
        step: "openlibrary-search-started",
        details: {},
      });

      act(() => {
        capturedOnMessage?.(event);
      });

      expect(mockUpdateEnrichment).toHaveBeenCalledWith(1, {
        currentStep: "openlibrary-search-started",
        status: "in-progress",
      });

      // No toast for progress events (too noisy)
      expect(mockToast).not.toHaveBeenCalled();
    });
  });

  describe("enrichment.completed", () => {
    it("should update context, show toast, and invalidate books query", async () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      renderHook(() => useWebSocketEvents(), { wrapper });

      const event = createMessageEvent("enrichment.completed", {
        bookId: 1,
        step: "completed",
        details: { source: "openlibrary", fieldsUpdated: ["title", "author"] },
      });

      act(() => {
        capturedOnMessage?.(event);
      });

      expect(mockUpdateEnrichment).toHaveBeenCalledWith(1, {
        currentStep: "completed",
        status: "completed",
        source: "openlibrary",
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: "Enrichment complete",
        description: "Book #1 enriched from openlibrary",
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["books"] });
    });

    it("should schedule cleanup after 5 seconds", async () => {
      renderHook(() => useWebSocketEvents(), { wrapper });

      const event = createMessageEvent("enrichment.completed", {
        bookId: 1,
        step: "completed",
        details: { source: "googlebooks" },
      });

      act(() => {
        capturedOnMessage?.(event);
      });

      expect(mockRemoveEnrichment).not.toHaveBeenCalled();

      // Fast-forward 5 seconds
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(mockRemoveEnrichment).toHaveBeenCalledWith(1);
    });

    it("should use 'enrichment' as default source when not provided", () => {
      renderHook(() => useWebSocketEvents(), { wrapper });

      const event = createMessageEvent("enrichment.completed", {
        bookId: 1,
        step: "completed",
        details: {},
      });

      act(() => {
        capturedOnMessage?.(event);
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: "Enrichment complete",
        description: "Book #1 enriched from enrichment",
      });
    });
  });

  describe("enrichment.failed", () => {
    it("should update context, show destructive toast, and invalidate queries", async () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      renderHook(() => useWebSocketEvents(), { wrapper });

      const event = createMessageEvent("enrichment.failed", {
        bookId: 1,
        failureReason: "No match found in any source",
        contentType: "book",
        sourcesAttempted: ["openlibrary", "googlebooks"],
      });

      act(() => {
        capturedOnMessage?.(event);
      });

      expect(mockUpdateEnrichment).toHaveBeenCalledWith(1, {
        currentStep: "enrichment-failed",
        status: "failed",
        reason: "No match found in any source",
      });

      expect(mockToast).toHaveBeenCalledWith({
        variant: "destructive",
        title: "Enrichment failed",
        description: "book moved to quarantine: No match found in any source",
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["quarantine"] });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["quarantine", "count"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["books"] });
    });

    it("should schedule cleanup after 8 seconds", async () => {
      renderHook(() => useWebSocketEvents(), { wrapper });

      const event = createMessageEvent("enrichment.failed", {
        bookId: 1,
        failureReason: "No match found",
        contentType: "manga",
        sourcesAttempted: ["anilist"],
      });

      act(() => {
        capturedOnMessage?.(event);
      });

      expect(mockRemoveEnrichment).not.toHaveBeenCalled();

      // Fast-forward 8 seconds
      act(() => {
        vi.advanceTimersByTime(8000);
      });

      expect(mockRemoveEnrichment).toHaveBeenCalledWith(1);
    });
  });

  describe("file.detected", () => {
    it("should show toast and invalidate books query", async () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      renderHook(() => useWebSocketEvents(), { wrapper });

      const event = createMessageEvent("file.detected", {
        filename: "test-book.epub",
        contentType: "book",
        bookId: 1,
        timestamp: "2026-01-01T00:00:00Z",
      });

      act(() => {
        capturedOnMessage?.(event);
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: "New content detected",
        description: "test-book.epub (book)",
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["books"] });
    });
  });

  describe("scan.completed", () => {
    it("should show toast with files processed count", async () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      renderHook(() => useWebSocketEvents(), { wrapper });

      const event = createMessageEvent("scan.completed", {
        filesFound: 5,
        filesProcessed: 3,
        filesSkipped: 2,
        errors: 0,
        duration: 1000,
      });

      act(() => {
        capturedOnMessage?.(event);
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: "Scan complete",
        description: "3 new file(s) added",
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["books"] });
    });

    it("should show 'no new files' when none processed", () => {
      renderHook(() => useWebSocketEvents(), { wrapper });

      const event = createMessageEvent("scan.completed", {
        filesFound: 0,
        filesProcessed: 0,
        filesSkipped: 0,
        errors: 0,
        duration: 500,
      });

      act(() => {
        capturedOnMessage?.(event);
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: "Scan complete",
        description: "No new files found",
      });
    });
  });

  describe("book.updated", () => {
    it("should invalidate quarantine and books queries", async () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      renderHook(() => useWebSocketEvents(), { wrapper });

      const event = createMessageEvent("book.updated", {
        bookId: 1,
        details: { status: "enriched" },
      });

      act(() => {
        capturedOnMessage?.(event);
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["quarantine"] });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["quarantine", "count"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["books"] });
    });
  });

  describe("error handling", () => {
    it("should handle malformed JSON gracefully", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      renderHook(() => useWebSocketEvents(), { wrapper });

      const event = new MessageEvent("message", {
        data: "not valid json",
      });

      act(() => {
        capturedOnMessage?.(event);
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to parse WebSocket message:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("should log unknown event types", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      renderHook(() => useWebSocketEvents(), { wrapper });

      const event = createMessageEvent("unknown.event", { data: "test" });

      act(() => {
        capturedOnMessage?.(event);
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "Unknown WebSocket event:",
        "unknown.event",
      );

      consoleSpy.mockRestore();
    });
  });

  describe("authentication", () => {
    it("should not connect WebSocket when not authenticated", () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        user: null,
        login: vi.fn(),
        logout: vi.fn(),
        isLoading: false,
      });

      renderHook(() => useWebSocketEvents(), { wrapper });

      // WebSocket should be called with empty URL when not authenticated
      expect(mockUseWebSocket).toHaveBeenCalledWith("", expect.any(Object));
    });

    it("should connect WebSocket when authenticated", () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        user: { id: 1, username: "test", role: "admin" },
        login: vi.fn(),
        logout: vi.fn(),
        isLoading: false,
      });

      renderHook(() => useWebSocketEvents(), { wrapper });

      expect(mockUseWebSocket).toHaveBeenCalledWith(
        expect.stringContaining("/ws"),
        expect.any(Object),
      );
    });
  });
});
