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

    // Book content type has two comboboxes: source and language
    const comboboxes = screen.getAllByRole("combobox");
    expect(comboboxes).toHaveLength(2);
    // First combobox is source selector
    expect(comboboxes[0]).toHaveTextContent("OpenLibrary");
  });

  it("should show language dropdown for book content type", () => {
    render(
      <MetadataSearchPanel
        bookId={1}
        initialQuery="The Hobbit"
        contentType="book"
      />
    );

    const comboboxes = screen.getAllByRole("combobox");
    // Second combobox is language selector, default is "All languages"
    expect(comboboxes[1]).toHaveTextContent("All languages");
  });

  it("should filter sources based on contentType (manga) and set default source", () => {
    render(
      <MetadataSearchPanel
        bookId={1}
        initialQuery="Naruto"
        contentType="manga"
      />
    );

    // Manga content type has only one combobox (no language dropdown)
    const comboboxes = screen.getAllByRole("combobox");
    expect(comboboxes).toHaveLength(1);
    expect(comboboxes[0]).toHaveTextContent("AniList");
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

  it("should pass language option to useMetadataSearch for book content", () => {
    render(
      <MetadataSearchPanel
        bookId={1}
        initialQuery="The Hobbit"
        contentType="book"
      />
    );

    // Hook should be called with query, source, and options
    // Default language is "any", so options should be undefined (no filter)
    expect(useMetadataSearch).toHaveBeenCalledWith(
      "The Hobbit",
      "openlibrary",
      undefined, // When language is "any", no options are passed
    );
  });

  it("should not pass language option for manga content", () => {
    render(
      <MetadataSearchPanel
        bookId={1}
        initialQuery="Naruto"
        contentType="manga"
      />
    );

    // Manga content type should not include language options
    expect(useMetadataSearch).toHaveBeenCalledWith(
      "Naruto",
      "anilist",
      undefined,
    );
  });

  describe("volume detection", () => {
    it("should display volume detection badge when title contains volume", () => {
      render(
        <MetadataSearchPanel
          bookId={1}
          initialQuery="One Piece T01"
          contentType="manga"
        />
      );

      expect(screen.getByText("Volume detected:")).toBeInTheDocument();
      expect(screen.getByText("Vol. 1")).toBeInTheDocument();
      expect(screen.getByText('(searching for "One Piece")')).toBeInTheDocument();
    });

    it("should not display volume detection when title has no volume", () => {
      render(
        <MetadataSearchPanel
          bookId={1}
          initialQuery="Harry Potter"
          contentType="book"
        />
      );

      expect(screen.queryByText("Volume detected:")).not.toBeInTheDocument();
    });

    it("should update volume detection when query changes", () => {
      const { rerender } = render(
        <MetadataSearchPanel
          bookId={1}
          initialQuery="Harry Potter"
          contentType="book"
        />
      );

      expect(screen.queryByText("Volume detected:")).not.toBeInTheDocument();

      // Simulate user typing a volume-containing query
      const input = screen.getByPlaceholderText(/search by title/i);
      fireEvent.change(input, { target: { value: "Naruto Vol. 5" } });

      expect(screen.getByText("Volume detected:")).toBeInTheDocument();
      expect(screen.getByText("Vol. 5")).toBeInTheDocument();
    });
  });

  describe("language persistence", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("should persist language preference to localStorage", () => {
      render(
        <MetadataSearchPanel
          bookId={1}
          initialQuery="The Hobbit"
          contentType="book"
        />
      );

      // Get language selector (second combobox)
      const comboboxes = screen.getAllByRole("combobox");
      const languageSelect = comboboxes[1];

      // Click to open
      fireEvent.click(languageSelect);

      // Select French - use getAllByText and pick the option element
      const frenchOptions = screen.getAllByText("Fran\u00e7ais");
      // The dropdown content option is in a portal, click the last one (the actual option)
      fireEvent.click(frenchOptions[frenchOptions.length - 1]);

      // Verify localStorage was updated
      expect(localStorage.getItem("tebroshelf:metadata-search-language")).toBe("fr");
    });

    it("should load language preference from localStorage", () => {
      localStorage.setItem("tebroshelf:metadata-search-language", "fr");

      render(
        <MetadataSearchPanel
          bookId={1}
          initialQuery="The Hobbit"
          contentType="book"
        />
      );

      const comboboxes = screen.getAllByRole("combobox");
      expect(comboboxes[1]).toHaveTextContent("Fran\u00e7ais");
    });
  });
});
