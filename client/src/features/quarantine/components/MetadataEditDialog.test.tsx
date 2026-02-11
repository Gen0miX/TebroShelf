import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MetadataEditDialog } from "./MetadataEditDialog";
import type { BookForEdit } from "../types";

// Mock the hooks
vi.mock("../hooks/useEditMetadata", () => ({
  useEditMetadata: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

vi.mock("../hooks/useUploadCover", () => ({
  useUploadCover: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

vi.mock("@/shared/hooks/use-toast", () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn(),
  })),
}));

import { useEditMetadata } from "../hooks/useEditMetadata";
import { useUploadCover } from "../hooks/useUploadCover";
import { useToast } from "@/shared/hooks/use-toast";

describe("MetadataEditDialog", () => {
  const mockBook: BookForEdit = {
    id: 1,
    title: "Test Book",
    author: "Test Author",
    description: null,
    genres: null,
    series: null,
    volume: null,
    isbn: null,
    publication_date: null,
    publisher: null,
    language: null,
    cover_path: null,
    content_type: "book",
    status: "enriched",
  };

  const defaultProps = {
    book: mockBook,
    open: true,
    onOpenChange: vi.fn(),
  };

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

  it("should render dialog when open is true", () => {
    render(<MetadataEditDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("Edit Metadata — Test Book")).toBeInTheDocument();
  });

  it("should not render dialog when open is false", () => {
    render(<MetadataEditDialog {...defaultProps} open={false} />, {
      wrapper: createWrapper(),
    });

    expect(screen.queryByText(/Edit Metadata/)).not.toBeInTheDocument();
  });

  it("should call onOpenChange when dialog is closed", () => {
    const onOpenChange = vi.fn();
    render(
      <MetadataEditDialog {...defaultProps} onOpenChange={onOpenChange} />,
      { wrapper: createWrapper() }
    );

    // Find and click the close button (X)
    const closeButton = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("should show success toast and close dialog on save success", async () => {
    const mockMutate = vi.fn((_, options) => {
      options?.onSuccess?.();
    });
    vi.mocked(useEditMetadata).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any);

    const mockToast = vi.fn();
    vi.mocked(useToast).mockReturnValue({ toast: mockToast });

    const onOpenChange = vi.fn();
    render(
      <MetadataEditDialog {...defaultProps} onOpenChange={onOpenChange} />,
      { wrapper: createWrapper() }
    );

    // Change a field to enable the save button
    const titleInput = screen.getByDisplayValue("Test Book");
    fireEvent.change(titleInput, { target: { value: "Updated Title" } });

    // Click save
    const saveButton = screen.getByRole("button", { name: /Save Changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Metadata updated",
        })
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("should show error toast and keep dialog open on save error", async () => {
    const mockMutate = vi.fn((_, options) => {
      options?.onError?.(new Error("Save failed"));
    });
    vi.mocked(useEditMetadata).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any);

    const mockToast = vi.fn();
    vi.mocked(useToast).mockReturnValue({ toast: mockToast });

    const onOpenChange = vi.fn();
    render(
      <MetadataEditDialog {...defaultProps} onOpenChange={onOpenChange} />,
      { wrapper: createWrapper() }
    );

    // Change a field to enable the save button
    const titleInput = screen.getByDisplayValue("Test Book");
    fireEvent.change(titleInput, { target: { value: "Updated Title" } });

    // Click save
    const saveButton = screen.getByRole("button", { name: /Save Changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: "Save failed",
        })
      );
      // Dialog should remain open
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  it("should show success toast on cover upload success", async () => {
    const mockMutate = vi.fn((_, options) => {
      options?.onSuccess?.();
    });
    vi.mocked(useUploadCover).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any);

    const mockToast = vi.fn();
    vi.mocked(useToast).mockReturnValue({ toast: mockToast });

    render(<MetadataEditDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    // Find the hidden file input and simulate file selection
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(["test"], "cover.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Cover updated",
        })
      );
    });
  });

  it("should show error toast on cover upload error", async () => {
    const mockMutate = vi.fn((_, options) => {
      options?.onError?.(new Error("Upload failed"));
    });
    vi.mocked(useUploadCover).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any);

    const mockToast = vi.fn();
    vi.mocked(useToast).mockReturnValue({ toast: mockToast });

    render(<MetadataEditDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    // Find the hidden file input and simulate file selection
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(["test"], "cover.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: "Cover upload failed",
        })
      );
    });
  });

  it("should display book title in dialog title", () => {
    render(<MetadataEditDialog {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("Edit Metadata — Test Book")).toBeInTheDocument();
  });

  it("should call onOpenChange when Cancel button is clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <MetadataEditDialog {...defaultProps} onOpenChange={onOpenChange} />,
      { wrapper: createWrapper() }
    );

    const cancelButton = screen.getByRole("button", { name: /Cancel/i });
    fireEvent.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
