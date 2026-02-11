import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useApproveQuarantine } from "./useApproveQuarantine";
import * as quarantineApi from "../services/quarantineApi";
import type { ReactNode } from "react";

// Mock the quarantineApi
vi.mock("../services/quarantineApi");

describe("useApproveQuarantine", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  // Task 9.9: Test mutation calls API with correct bookId
  describe("Mutation Function", () => {
    it("should call approveQuarantineItem with correct bookId", async () => {
      const mockResponse = {
        data: {
          id: 1,
          title: "Test Book",
          status: "enriched",
          content_type: "book" as const,
          cover_path: null,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
          author: null,
        },
      };

      vi.mocked(quarantineApi.approveQuarantineItem).mockResolvedValue(
        mockResponse
      );

      const { result } = renderHook(() => useApproveQuarantine(), { wrapper });

      result.current.mutate(42);

      await waitFor(() => {
        expect(quarantineApi.approveQuarantineItem).toHaveBeenCalledWith(42);
      });
    });

    it("should return success data on successful mutation", async () => {
      const mockResponse = {
        data: {
          id: 1,
          title: "Test Book",
          status: "enriched",
          content_type: "book" as const,
          cover_path: "/covers/1.jpg",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
          author: "Test Author",
        },
      };

      vi.mocked(quarantineApi.approveQuarantineItem).mockResolvedValue(
        mockResponse
      );

      const { result } = renderHook(() => useApproveQuarantine(), { wrapper });

      result.current.mutate(1);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockResponse);
    });

    it("should return error on failed mutation", async () => {
      const error = new Error("Book not found");
      vi.mocked(quarantineApi.approveQuarantineItem).mockRejectedValue(error);

      const { result } = renderHook(() => useApproveQuarantine(), { wrapper });

      result.current.mutate(999);

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe("Book not found");
    });
  });

  // Task 9.10: Test success callback invalidates queries
  describe("Query Invalidation on Success", () => {
    it("should invalidate quarantine queries on success", async () => {
      const mockResponse = {
        data: {
          id: 1,
          title: "Test Book",
          status: "enriched",
          content_type: "book" as const,
          cover_path: null,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
          author: null,
        },
      };

      vi.mocked(quarantineApi.approveQuarantineItem).mockResolvedValue(
        mockResponse
      );

      const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useApproveQuarantine(), { wrapper });

      result.current.mutate(1);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["quarantine"],
      });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["quarantine", "count"],
      });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ["books"],
      });
    });

    it("should not invalidate queries on error", async () => {
      const error = new Error("Failed to approve");
      vi.mocked(quarantineApi.approveQuarantineItem).mockRejectedValue(error);

      const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useApproveQuarantine(), { wrapper });

      result.current.mutate(1);

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      // invalidateQueries should not have been called for quarantine
      expect(invalidateQueriesSpy).not.toHaveBeenCalledWith({
        queryKey: ["quarantine"],
      });
    });
  });

  describe("Pending State", () => {
    it("should set isPending to true while mutation is in progress", async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(quarantineApi.approveQuarantineItem).mockReturnValue(
        pendingPromise as any
      );

      const { result } = renderHook(() => useApproveQuarantine(), { wrapper });

      result.current.mutate(1);

      await waitFor(() => {
        expect(result.current.isPending).toBe(true);
      });

      // Resolve to clean up
      resolvePromise!({
        data: {
          id: 1,
          title: "Test",
          status: "enriched",
          content_type: "book",
          cover_path: null,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
          author: null,
        },
      });

      await waitFor(() => {
        expect(result.current.isPending).toBe(false);
      });
    });
  });
});
