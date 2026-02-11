import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUploadCover } from "./useUploadCover";
import * as metadataEditApi from "../services/metadataEditApi";

// Mock the API
vi.mock("../services/metadataEditApi", () => ({
  uploadCover: vi.fn(),
}));

describe("useUploadCover", () => {
  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should send FormData to cover endpoint", async () => {
    const mockResponse = {
      data: { bookId: 1, coverPath: "covers/1.jpg" },
    };
    vi.mocked(metadataEditApi.uploadCover).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useUploadCover(), {
      wrapper: createWrapper(),
    });

    const file = new File(["test"], "cover.jpg", { type: "image/jpeg" });
    result.current.mutate({ bookId: 1, file });

    await waitFor(() => {
      expect(metadataEditApi.uploadCover).toHaveBeenCalledWith(1, file);
    });
  });

  it("should invalidate queries on success", async () => {
    const mockResponse = {
      data: { bookId: 1, coverPath: "covers/1.jpg" },
    };
    vi.mocked(metadataEditApi.uploadCover).mockResolvedValue(mockResponse);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUploadCover(), { wrapper });

    const file = new File(["test"], "cover.jpg", { type: "image/jpeg" });
    result.current.mutate({ bookId: 1, file });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["books"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["quarantine"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["book", 1] });
    });
  });

  it("should expose isPending state", async () => {
    vi.mocked(metadataEditApi.uploadCover).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { result } = renderHook(() => useUploadCover(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPending).toBe(false);

    const file = new File(["test"], "cover.jpg", { type: "image/jpeg" });
    result.current.mutate({ bookId: 1, file });

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });
  });

  it("should handle API errors", async () => {
    const error = new Error("File too large");
    vi.mocked(metadataEditApi.uploadCover).mockRejectedValue(error);

    const { result } = renderHook(() => useUploadCover(), {
      wrapper: createWrapper(),
    });

    let caughtError: Error | null = null;
    const file = new File(["test"], "cover.jpg", { type: "image/jpeg" });
    result.current.mutate(
      { bookId: 1, file },
      {
        onError: (e) => {
          caughtError = e;
        },
      }
    );

    await waitFor(() => {
      expect(caughtError).toEqual(error);
    });
  });
});
