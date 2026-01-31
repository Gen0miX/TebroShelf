import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MetadataSearchResult } from "./MetadataSearchResult";
import type { MetadataSearchResult as MetadataSearchResultType } from "../types";

describe("MetadataSearchResult", () => {
  const mockResult: MetadataSearchResultType = {
    sourceId: 1,
    externalId: 123,
    title: "Test Book Title",
    author: "Test Author",
    description: "Test Description",
    coverUrl: "http://example.com/cover.jpg",
    genres: "Fiction, Fantasy",
    publicationDate: "2023",
    source: "openlibrary",
  };

  it("should render title and author correctly", () => {
    render(<MetadataSearchResult result={mockResult} />);
    
    expect(screen.getByText("Test Book Title")).toBeInTheDocument();
    expect(screen.getByText("Test Author")).toBeInTheDocument();
  });

  it("should render source badge with correct label", () => {
    render(<MetadataSearchResult result={mockResult} />);
    
    expect(screen.getByText("OpenLibrary")).toBeInTheDocument();
  });

  it("should show loader initially when coverUrl is provided", () => {
    render(<MetadataSearchResult result={mockResult} />);
    
    // Check for spinner (it has aria-label="Loading" in spinner.tsx)
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
    
    // Image should be invisible (opacity-0)
    const img = screen.getByAltText("Test Book Title");
    expect(img).toHaveClass("opacity-0");
  });

  it("should hide loader and show image after successful load", () => {
    render(<MetadataSearchResult result={mockResult} />);
    
    const img = screen.getByAltText("Test Book Title");
    fireEvent.load(img);
    
    expect(screen.queryByLabelText("Loading")).not.toBeInTheDocument();
    expect(img).toHaveClass("opacity-100");
  });

  it("should hide loader if image fails to load", () => {
    render(<MetadataSearchResult result={mockResult} />);
    
    const img = screen.getByAltText("Test Book Title");
    fireEvent.error(img);
    
    expect(screen.queryByLabelText("Loading")).not.toBeInTheDocument();
  });

  it("should show placeholder icon when coverUrl is missing", () => {
    const resultWithoutCover = { ...mockResult, coverUrl: null };
    render(<MetadataSearchResult result={resultWithoutCover} />);
    
    // ImageIcon is a lucide-react component, usually renders as a svg with class lucide-image-icon
    // In our component, we don't give it a testid, but we can check if the img is NOT there
    expect(screen.queryByAltText("Test Book Title")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Loading")).not.toBeInTheDocument();
  });

  it("should call onSelect when clicked", () => {
    const onSelect = vi.fn();
    render(<MetadataSearchResult result={mockResult} onSelect={onSelect} />);
    
    fireEvent.click(screen.getByText("Test Book Title").closest(".rounded-xl")!);
    expect(onSelect).toHaveBeenCalledWith(mockResult);
  });
});
