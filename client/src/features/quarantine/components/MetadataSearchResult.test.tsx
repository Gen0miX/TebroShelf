import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MetadataSearchResult } from "./MetadataSearchResult";
import type { MetadataSearchResult as MetadataSearchResultType } from "../types";

describe("MetadataSearchResult", () => {
  const mockResult: MetadataSearchResultType = {
    sourceId: "OL123",
    externalId: "OL123",
    title: "Test Book Title",
    author: "Test Author",
    description: "Test Description",
    coverUrl: "http://example.com/cover.jpg",
    genres: ["Fiction", "Fantasy"],
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

  it("should display volume badge when volume is present", () => {
    const resultWithVolume = { ...mockResult, volume: 5 };
    render(<MetadataSearchResult result={resultWithVolume} />);

    expect(screen.getByText("Vol. 5")).toBeInTheDocument();
  });

  it("should not display volume badge when volume is null", () => {
    const resultWithoutVolume = { ...mockResult, volume: null };
    render(<MetadataSearchResult result={resultWithoutVolume} />);

    expect(screen.queryByText(/Vol\./)).not.toBeInTheDocument();
  });

  it("should not display volume badge when volume is undefined", () => {
    render(<MetadataSearchResult result={mockResult} />);

    expect(screen.queryByText(/Vol\./)).not.toBeInTheDocument();
  });

  describe("language badge", () => {
    it("should display FR badge when language is fr", () => {
      const resultWithFrench = { ...mockResult, language: "fr" };
      render(<MetadataSearchResult result={resultWithFrench} />);

      expect(screen.getByText("FR")).toBeInTheDocument();
    });

    it("should display FR badge when language is fre (ISO 639-2)", () => {
      const resultWithFrench = { ...mockResult, language: "fre" };
      render(<MetadataSearchResult result={resultWithFrench} />);

      expect(screen.getByText("FR")).toBeInTheDocument();
    });

    it("should display EN badge when language is en", () => {
      const resultWithEnglish = { ...mockResult, language: "en" };
      render(<MetadataSearchResult result={resultWithEnglish} />);

      expect(screen.getByText("EN")).toBeInTheDocument();
    });

    it("should display EN badge when language is eng (ISO 639-2)", () => {
      const resultWithEnglish = { ...mockResult, language: "eng" };
      render(<MetadataSearchResult result={resultWithEnglish} />);

      expect(screen.getByText("EN")).toBeInTheDocument();
    });

    it("should display JP badge when language is ja", () => {
      const resultWithJapanese = { ...mockResult, language: "ja" };
      render(<MetadataSearchResult result={resultWithJapanese} />);

      expect(screen.getByText("JP")).toBeInTheDocument();
    });

    it("should not display language badge when language is null", () => {
      const resultWithoutLanguage = { ...mockResult, language: null };
      render(<MetadataSearchResult result={resultWithoutLanguage} />);

      // Should only have the source badge (OpenLibrary), not FR/EN/JP
      expect(screen.queryByText("FR")).not.toBeInTheDocument();
      expect(screen.queryByText("EN")).not.toBeInTheDocument();
      expect(screen.queryByText("JP")).not.toBeInTheDocument();
    });

    it("should not display language badge when language is undefined", () => {
      render(<MetadataSearchResult result={mockResult} />);

      // mockResult has no language field
      expect(screen.queryByText("FR")).not.toBeInTheDocument();
      expect(screen.queryByText("EN")).not.toBeInTheDocument();
    });
  });
});
