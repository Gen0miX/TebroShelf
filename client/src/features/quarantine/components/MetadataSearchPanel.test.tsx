import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MetadataSearchPanel } from "./MetadataSearchPanel";
import { useAvailableSources } from "../hooks/useAvailableSources";
import { useMetadataSearch } from "../hooks/useMetadataSearch";

// Mock the hooks
vi.mock("../hooks/useAvailableSources");
vi.mock("../hooks/useMetadataSearch");

// Mock MetadataSearchResult to focus on Panel logic
vi.mock("./MetadataSearchResult", () => ({
  MetadataSearchResult: ({ result, onSelect }: any) => (
    <div data-testid="search-result" onClick={() => onSelect?.(result)}>
      {result.title}
    </div>
  ),
}));

describe("MetadataSearchPanel", () => {
  const mockRefetch = vi.fn();
  const mockOnResultSelect = vi.fn();

  const mockSources = ["openlibrary", "anilist", "mangadex"];
  const mockResults = [
    { externalId: "1", title: "Result 1", source: "openlibrary" },
    { externalId: "2", title: "Result 2", source: "openlibrary" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock implementation
    vi.mocked(useAvailableSources).mockReturnValue({
      data: mockSources,
      isLoading: false,
    } as any);

    vi.mocked(useMetadataSearch).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      isFetched: false,
    } as any);
  });

  it("should pre-populate search input with initialQuery", () => {
    render(
      <MetadataSearchPanel
        bookId={1}
        initialQuery="The Hobbit"
        contentType="book"
      />
    );
    
    expect(screen.getByPlaceholderText(/search by title/i)).toHaveValue("The Hobbit");
  });

  it("should filter sources based on contentType (book)", () => {
    render(
      <MetadataSearchPanel
        bookId={1}
        initialQuery="The Hobbit"
        contentType="book"
      />
    );
    
    // Open select (SelectTrigger)
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("OpenLibrary");
  });

  it("should filter sources based on contentType (manga) and set default source", () => {
    render(
      <MetadataSearchPanel
        bookId={1}
        initialQuery="Naruto"
        contentType="manga"
      />
    );
    
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("AniList");
  });

  it("should trigger search when button is clicked", () => {
    render(
      <MetadataSearchPanel
        bookId={1}
        initialQuery="The Hobbit"
        contentType="book"
      />
    );
    
    const searchButton = screen.getByRole("button", { name: /search/i });
    fireEvent.click(searchButton);
    
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("should trigger search when Enter is pressed", () => {
    render(
      <MetadataSearchPanel
        bookId={1}
        initialQuery="The Hobbit"
        contentType="book"
      />
    );
    
    const input = screen.getByPlaceholderText(/search by title/i);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("should show loading state (skeletons)", () => {
    vi.mocked(useMetadataSearch).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: mockRefetch,
      isFetched: false,
    } as any);

    render(
      <MetadataSearchPanel
        bookId={1}
        contentType="book"
      />
    );
    
    // Check for skeletons (at least 5 as updated by user)
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(5);
  });

  it("should render results list", () => {
    vi.mocked(useMetadataSearch).mockReturnValue({
      data: mockResults,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      isFetched: true,
    } as any);

    render(
      <MetadataSearchPanel
        bookId={1}
        contentType="book"
        onResultSelect={mockOnResultSelect}
      />
    );
    
    const results = screen.getAllByTestId("search-result");
    expect(results).toHaveLength(2);
    expect(screen.getByText("Result 1")).toBeInTheDocument();
    expect(screen.getByText("Result 2")).toBeInTheDocument();
    
    fireEvent.click(results[0]);
    expect(mockOnResultSelect).toHaveBeenCalledWith(mockResults[0]);
  });

  it("should show empty state message", () => {
    vi.mocked(useMetadataSearch).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      isFetched: true,
    } as any);

    render(
      <MetadataSearchPanel
        bookId={1}
        contentType="book"
      />
    );
    
    expect(screen.getByText(/no results found/i)).toBeInTheDocument();
  });

  it("should show error state and allow retry", () => {
    vi.mocked(useMetadataSearch).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
      isFetched: true,
    } as any);

    render(
      <MetadataSearchPanel
        bookId={1}
        initialQuery="The Hobbit"
        contentType="book"
      />
    );
    
    expect(screen.getByText(/search failed/i)).toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retryButton);
    expect(mockRefetch).toHaveBeenCalled();
  });
});
