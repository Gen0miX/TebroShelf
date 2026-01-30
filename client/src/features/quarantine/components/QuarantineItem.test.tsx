import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuarantineItem } from "./QuarantineItem";
import type { QuarantineItemType } from "../types";

// Mock import.meta.env
vi.stubGlobal('import.meta.env', {
  VITE_API_URL: 'http://localhost:3000'
});

describe("QuarantineItem", () => {
  const mockItem: QuarantineItemType = {
    id: 1,
    title: "Test Book",
    author: "Test Author",
    description: "Test Description",
    genres: "Fiction",
    series: "Test Series",
    volume: 1,
    isbn: "1234567890",
    publication_date: "2023-01-01",
    publisher: "Test Publisher",
    language: "fr",
    file_path: "/path/to/test-book.epub",
    file_type: "epub",
    content_type: "book",
    cover_path: "covers/test-book.jpg",
    publication_status: "published",
    status: "quarantine",
    failure_reason: "Missing metadata",
    visibility: "public",
    created_at: "2024-01-30T10:00:00Z",
    updated_at: "2024-01-30T10:00:00Z",
  };

  it("should render item filename correctly", () => {
    render(<QuarantineItem item={mockItem} />);
    expect(screen.getByText("test-book.epub")).toBeInTheDocument();
  });

  it("should display the correct date added", () => {
    render(<QuarantineItem item={mockItem} />);
    // format(new Date("2024-01-30T10:00:00Z"), "PPP", { locale: fr }) -> "30 janvier 2024"
    // Use a flexible regex to avoid encoding issues with 'é'
    expect(screen.getByText(/Ajout.* 30 janvier 2024/i)).toBeInTheDocument();
  });

  it("should display the failure reason", () => {
    render(<QuarantineItem item={mockItem} />);
    expect(screen.getByText("Missing metadata")).toBeInTheDocument();
  });

  it("should display a fallback message when failure reason is null", () => {
    const itemWithoutReason = { ...mockItem, failure_reason: null };
    render(<QuarantineItem item={itemWithoutReason} />);
    expect(screen.getByText("Erreur de traitement inconnue")).toBeInTheDocument();
  });

  it("should render content_type badge correctly for book", () => {
    render(<QuarantineItem item={mockItem} />);
    const badge = screen.getByText("book");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-primary"); // default variant
  });

  it("should render content_type badge correctly for manga", () => {
    const mangaItem = { ...mockItem, content_type: "manga" as const };
    render(<QuarantineItem item={mangaItem} />);
    const badge = screen.getByText("manga");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-accent"); // accent variant
  });

  it("should render file type badge", () => {
    render(<QuarantineItem item={mockItem} />);
    expect(screen.getByTestId("file-type")).toHaveTextContent(/epub/i);
  });

  it("should render language badge when language is present", () => {
    render(<QuarantineItem item={mockItem} />);
    expect(screen.getByText("FR")).toBeInTheDocument();
  });

  it("should not render language badge when language is null", () => {
    const itemWithoutLang = { ...mockItem, language: null };
    render(<QuarantineItem item={itemWithoutLang} />);
    expect(screen.queryByText("FR")).not.toBeInTheDocument();
  });

  it("should render cover image when cover_path is provided", () => {
    render(<QuarantineItem item={mockItem} />);
    const img = screen.getByAltText("test-book.epub") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain("covers/test-book.jpg");
  });

  it("should render fallback icon when cover_path is null", () => {
    const itemWithoutCover = { ...mockItem, cover_path: null };
    render(<QuarantineItem item={itemWithoutCover} />);
    expect(screen.getByText("Pas de couverture")).toBeInTheDocument();
  });
});
