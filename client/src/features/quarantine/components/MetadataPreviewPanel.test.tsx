import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MetadataPreviewPanel } from "./MetadataPreviewPanel";
import type { MetadataSearchResult } from "../types";
import type { CurrentBookData } from "./MetadataPreviewPanel";

describe("MetadataPreviewPanel", () => {
  const mockResult: MetadataSearchResult = {
    sourceId: "OL123",
    externalId: "OL123",
    title: "Harry Potter and the Philosopher's Stone",
    author: "J.K. Rowling",
    description: "A young wizard discovers his magical heritage.",
    coverUrl: "http://example.com/cover.jpg",
    genres: ["Fantasy", "Young Adult"],
    publicationDate: "1997-06-26",
    source: "openlibrary",
    publisher: "Bloomsbury",
    isbn: "978-0747532699",
    language: "English",
    series: "Harry Potter",
    volume: 1,
  };

  const mockCurrentBook: CurrentBookData = {
    title: "unknown.epub",
    author: null,
    description: null,
    genres: null,
    coverPath: null,
    contentType: "book",
    publisher: null,
    publicationDate: null,
    isbn: null,
    language: null,
    series: null,
    volume: null,
  };

  const defaultProps = {
    result: mockResult,
    currentBook: mockCurrentBook,
    onApply: vi.fn(),
    onBack: vi.fn(),
    isApplying: false,
  };

  it("should render selected metadata title", () => {
    render(<MetadataPreviewPanel {...defaultProps} />);

    expect(
      screen.getByText("Harry Potter and the Philosopher's Stone"),
    ).toBeInTheDocument();
  });

  it("should render selected metadata author", () => {
    render(<MetadataPreviewPanel {...defaultProps} />);

    expect(screen.getByText("J.K. Rowling")).toBeInTheDocument();
  });

  it("should render current book title for comparison", () => {
    render(<MetadataPreviewPanel {...defaultProps} />);

    expect(screen.getByText("unknown.epub")).toBeInTheDocument();
  });

  it("should render source badge with correct label", () => {
    render(<MetadataPreviewPanel {...defaultProps} />);

    expect(screen.getByText(/OpenLibrary/)).toBeInTheDocument();
  });

  it("should render all metadata fields", () => {
    render(<MetadataPreviewPanel {...defaultProps} />);

    expect(screen.getByText("Bloomsbury")).toBeInTheDocument();
    expect(screen.getByText("978-0747532699")).toBeInTheDocument();
    expect(screen.getByText("1997-06-26")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.getByText("Harry Potter")).toBeInTheDocument();
    expect(screen.getByText("Fantasy, Young Adult")).toBeInTheDocument();
  });

  it("should show dash for missing current book fields", () => {
    render(<MetadataPreviewPanel {...defaultProps} />);

    // Multiple dashes should be present for null fields
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("should call onApply when Apply button is clicked", () => {
    const onApply = vi.fn();
    render(<MetadataPreviewPanel {...defaultProps} onApply={onApply} />);

    fireEvent.click(screen.getByText("Appliquer"));

    expect(onApply).toHaveBeenCalledWith(mockResult);
  });

  it("should call onBack when Back button is clicked", () => {
    const onBack = vi.fn();
    render(<MetadataPreviewPanel {...defaultProps} onBack={onBack} />);

    fireEvent.click(screen.getByText("Retour"));

    expect(onBack).toHaveBeenCalled();
  });

  it("should call onBack when Cancel button is clicked", () => {
    const onBack = vi.fn();
    render(<MetadataPreviewPanel {...defaultProps} onBack={onBack} />);

    fireEvent.click(screen.getByText("Annuler"));

    expect(onBack).toHaveBeenCalled();
  });

  it("should show loading state when isApplying is true", () => {
    render(<MetadataPreviewPanel {...defaultProps} isApplying={true} />);

    expect(screen.getByText("Application...")).toBeInTheDocument();
  });

  it("should disable buttons when isApplying is true", () => {
    render(<MetadataPreviewPanel {...defaultProps} isApplying={true} />);

    expect(screen.getByText("Retour").closest("button")).toBeDisabled();
    expect(screen.getByText("Annuler").closest("button")).toBeDisabled();
    expect(screen.getByText("Application...").closest("button")).toBeDisabled();
  });

  it("should render cover image when coverUrl is present", () => {
    render(<MetadataPreviewPanel {...defaultProps} />);

    const img = screen.getByAltText("New cover");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "http://example.com/cover.jpg");
  });

  it("should show placeholder when no coverUrl", () => {
    const resultWithoutCover = { ...mockResult, coverUrl: null };
    render(
      <MetadataPreviewPanel {...defaultProps} result={resultWithoutCover} />,
    );

    expect(screen.queryByAltText("New cover")).not.toBeInTheDocument();
  });

  it("should render different source badges correctly", () => {
    const googleResult = { ...mockResult, source: "googlebooks" as const };
    render(<MetadataPreviewPanel {...defaultProps} result={googleResult} />);

    expect(screen.getByText(/Google Books/)).toBeInTheDocument();
  });

  it("should render manga sources correctly", () => {
    const anilistResult = { ...mockResult, source: "anilist" as const };
    render(<MetadataPreviewPanel {...defaultProps} result={anilistResult} />);

    expect(screen.getByText(/AniList/)).toBeInTheDocument();
  });
});
