import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MetadataEditForm } from "./MetadataEditForm";
import type { BookForEdit } from "../types";

describe("MetadataEditForm", () => {
  const mockBook: BookForEdit = {
    id: 1,
    title: "Test Book",
    author: "Test Author",
    description: "Test description",
    genres: JSON.stringify(["Fiction", "Adventure"]),
    series: "Test Series",
    volume: 1,
    isbn: "978-0000000001",
    publication_date: "2020-01-01",
    publisher: "Test Publisher",
    language: "en",
    cover_path: "covers/1.jpg",
    content_type: "book",
    status: "enriched",
  };

  const defaultProps = {
    book: mockBook,
    onSave: vi.fn(),
    onCoverUpload: vi.fn(),
    isSaving: false,
    isUploadingCover: false,
  };

  it("should render all metadata fields pre-populated", () => {
    render(<MetadataEditForm {...defaultProps} />);

    expect(screen.getByDisplayValue("Test Book")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test Author")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test description")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test Series")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("978-0000000001")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2020-01-01")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test Publisher")).toBeInTheDocument();
    expect(screen.getByDisplayValue("en")).toBeInTheDocument();
  });

  it("should display genres as comma-separated string from JSON array", () => {
    render(<MetadataEditForm {...defaultProps} />);

    expect(
      screen.getByDisplayValue("Fiction, Adventure")
    ).toBeInTheDocument();
  });

  it("should require title field", () => {
    render(<MetadataEditForm {...defaultProps} />);

    const titleInput = screen.getByLabelText(/Title/);
    expect(titleInput).toHaveAttribute("required");
  });

  it("should trigger onSave with correct data when form is submitted", () => {
    const onSave = vi.fn();
    render(<MetadataEditForm {...defaultProps} onSave={onSave} />);

    // Change the title
    const titleInput = screen.getByLabelText(/Title/);
    fireEvent.change(titleInput, { target: { value: "New Title" } });

    // Submit the form
    const saveButton = screen.getByRole("button", { name: /Save Changes/i });
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "New Title",
      })
    );
  });

  it("should parse genres to array on submit", () => {
    const onSave = vi.fn();
    render(<MetadataEditForm {...defaultProps} onSave={onSave} />);

    // Change genres
    const genresInput = screen.getByLabelText(/Genres/);
    fireEvent.change(genresInput, {
      target: { value: "Sci-Fi, Fantasy, Action" },
    });

    // Submit the form
    const saveButton = screen.getByRole("button", { name: /Save Changes/i });
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        genres: ["Sci-Fi", "Fantasy", "Action"],
      })
    );
  });

  it("should disable save button when isSaving is true", () => {
    render(<MetadataEditForm {...defaultProps} isSaving={true} />);

    const saveButton = screen.getByRole("button", { name: /Saving/i });
    expect(saveButton).toBeDisabled();
  });

  it("should accept only image file types for cover input", () => {
    render(<MetadataEditForm {...defaultProps} />);

    // Find the hidden file input
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    expect(fileInput).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp,image/gif"
    );
  });

  it("should trigger onCoverUpload when file is selected", () => {
    const onCoverUpload = vi.fn();
    render(
      <MetadataEditForm {...defaultProps} onCoverUpload={onCoverUpload} />
    );

    // Find the hidden file input
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(["test"], "cover.jpg", { type: "image/jpeg" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(onCoverUpload).toHaveBeenCalledWith(file);
  });

  it("should render current cover image preview when cover_path exists", () => {
    render(<MetadataEditForm {...defaultProps} />);

    const img = screen.getByAltText("Cover preview");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/api/v1/books/1/cover");
  });

  it("should render placeholder when no cover_path", () => {
    const bookWithoutCover = { ...mockBook, cover_path: null };
    render(<MetadataEditForm {...defaultProps} book={bookWithoutCover} />);

    expect(screen.queryByAltText("Cover preview")).not.toBeInTheDocument();
  });

  it("should show uploading state when isUploadingCover is true", () => {
    render(<MetadataEditForm {...defaultProps} isUploadingCover={true} />);

    expect(screen.getByText("Uploading...")).toBeInTheDocument();
  });

  it("should handle empty genres gracefully", () => {
    const bookWithNullGenres = { ...mockBook, genres: null };
    render(<MetadataEditForm {...defaultProps} book={bookWithNullGenres} />);

    const genresInput = screen.getByLabelText(/Genres/);
    expect(genresInput).toHaveValue("");
  });

  it("should not call onSave when no changes made", () => {
    const onSave = vi.fn();
    render(<MetadataEditForm {...defaultProps} onSave={onSave} />);

    // Submit without changes
    const saveButton = screen.getByRole("button", { name: /Save Changes/i });
    fireEvent.click(saveButton);

    expect(onSave).not.toHaveBeenCalled();
  });

  it("should allow setting fields to empty/null", () => {
    const onSave = vi.fn();
    render(<MetadataEditForm {...defaultProps} onSave={onSave} />);

    // Clear the author field
    const authorInput = screen.getByLabelText(/Author/);
    fireEvent.change(authorInput, { target: { value: "" } });

    // Submit the form
    const saveButton = screen.getByRole("button", { name: /Save Changes/i });
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        author: null,
      })
    );
  });

  it("should render Cancel button when onCancel is provided", () => {
    const onCancel = vi.fn();
    render(<MetadataEditForm {...defaultProps} onCancel={onCancel} />);

    const cancelButton = screen.getByRole("button", { name: /Cancel/i });
    expect(cancelButton).toBeInTheDocument();
  });

  it("should trigger onCancel when Cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(<MetadataEditForm {...defaultProps} onCancel={onCancel} />);

    const cancelButton = screen.getByRole("button", { name: /Cancel/i });
    fireEvent.click(cancelButton);

    expect(onCancel).toHaveBeenCalled();
  });

  it("should not render Cancel button when onCancel is not provided", () => {
    render(<MetadataEditForm {...defaultProps} />);

    expect(screen.queryByRole("button", { name: /Cancel/i })).not.toBeInTheDocument();
  });

  it("should disable Cancel button when isSaving is true", () => {
    const onCancel = vi.fn();
    render(<MetadataEditForm {...defaultProps} onCancel={onCancel} isSaving={true} />);

    const cancelButton = screen.getByRole("button", { name: /Cancel/i });
    expect(cancelButton).toBeDisabled();
  });
});
