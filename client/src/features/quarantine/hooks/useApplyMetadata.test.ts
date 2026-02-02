import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useApplyMetadata } from "./useApplyMetadata";
import * as metadataSearchApi from "../services/metadataSearchApi";
import type { ApplyMetadataRequest } from "../types";

vi.mock("../services/metadataSearchApi");

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
};

describe("useApplyMetadata", () => {
  const mockMetadata: ApplyMetadataRequest = {
    title: "Test Book",
    author: "Test Author",
    description: "Test Description",
    genres: ["Fiction"],
    publicationDate: "2023-01-01",
    publisher: "Test Publisher",
    isbn: "123-456-789",
    language: "English",
    series: "Test Series",
    volume: 1,
    coverUrl: "http://example.com/cover.jpg",
    source: "openlibrary",
    externalId: "OL123",
  };

  const mockResponse = {
    bookId: 123,
    fieldsUpdated: ["title", "author", "description"],
    coverDownloaded: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call applyMetadata API with correct parameters", async () => {
    vi.mocked(metadataSearchApi.applyMetadata).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useApplyMetadata(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ bookId: 123, metadata: mockMetadata });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(metadataSearchApi.applyMetadata).toHaveBeenCalledWith(
      123,
      mockMetadata,
    );
  });

  it("should set isPending to true while mutation is in progress", async () => {
    let resolvePromise: (value: typeof mockResponse) => void;
    const promise = new Promise<typeof mockResponse>((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(metadataSearchApi.applyMetadata).mockReturnValue(promise);

    const { result } = renderHook(() => useApplyMetadata(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ bookId: 123, metadata: mockMetadata });

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    resolvePromise!(mockResponse);

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });

  it("should set isError to true when mutation fails", async () => {
    const error = new Error("Network error");
    vi.mocked(metadataSearchApi.applyMetadata).mockRejectedValue(error);

    const { result } = renderHook(() => useApplyMetadata(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ bookId: 123, metadata: mockMetadata });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBe(error);
  });

  it("should return isSuccess true after successful mutation", async () => {
    vi.mocked(metadataSearchApi.applyMetadata).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useApplyMetadata(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ bookId: 123, metadata: mockMetadata });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it("should invalidate quarantine queries on success", async () => {
    vi.mocked(metadataSearchApi.applyMetadata).mockResolvedValue(mockResponse);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useApplyMetadata(), { wrapper });

    result.current.mutate({ bookId: 123, metadata: mockMetadata });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["quarantine"],
    });
  });
});
