import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEditMetadata } from "./useEditMetadata";
import * as metadataEditApi from "../services/metadataEditApi";

// Mock the API
vi.mock("../services/metadataEditApi", () => ({
  editMetadata: vi.fn(),
}));

describe("useEditMetadata", () => {
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

  it("should call editMetadata API with correct parameters", async () => {
    const mockResponse = {
      data: { bookId: 1, fieldsUpdated: ["title"] },
    };
    vi.mocked(metadataEditApi.editMetadata).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useEditMetadata(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ bookId: 1, data: { title: "New Title" } });

    await waitFor(() => {
      expect(metadataEditApi.editMetadata).toHaveBeenCalledWith(1, {
        title: "New Title",
      });
    });
  });

  it("should invalidate book and quarantine queries on success", async () => {
    const mockResponse = {
      data: { bookId: 1, fieldsUpdated: ["title"] },
    };
    vi.mocked(metadataEditApi.editMetadata).mockResolvedValue(mockResponse);

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

    const { result } = renderHook(() => useEditMetadata(), { wrapper });

    result.current.mutate({ bookId: 1, data: { title: "New Title" } });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["books"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["quarantine"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["book", 1] });
    });
  });

  it("should expose isPending state", async () => {
    vi.mocked(metadataEditApi.editMetadata).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { result } = renderHook(() => useEditMetadata(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPending).toBe(false);

    result.current.mutate({ bookId: 1, data: { title: "New Title" } });

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });
  });

  it("should handle API errors", async () => {
    const error = new Error("Failed to update metadata");
    vi.mocked(metadataEditApi.editMetadata).mockRejectedValue(error);

    const { result } = renderHook(() => useEditMetadata(), {
      wrapper: createWrapper(),
    });

    let caughtError: Error | null = null;
    result.current.mutate(
      { bookId: 1, data: { title: "New Title" } },
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
