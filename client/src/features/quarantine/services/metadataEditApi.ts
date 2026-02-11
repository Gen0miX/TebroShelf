import type {
  EditMetadataRequest,
  EditMetadataResponse,
  CoverUploadResponse,
} from "../types";

/**
 * Edit metadata for a book
 * @param bookId - The book ID to edit
 * @param data - The metadata fields to update
 */
export async function editMetadata(
  bookId: number,
  data: EditMetadataRequest
): Promise<EditMetadataResponse> {
  const response = await fetch(`/api/v1/books/${bookId}/metadata`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to update metadata");
  }

  return response.json();
}

/**
 * Upload a cover image for a book
 * @param bookId - The book ID to upload cover for
 * @param file - The image file to upload
 */
export async function uploadCover(
  bookId: number,
  file: File
): Promise<CoverUploadResponse> {
  const formData = new FormData();
  formData.append("cover", file);

  const response = await fetch(`/api/v1/books/${bookId}/cover`, {
    method: "POST",
    credentials: "include",
    body: formData,
    // NOTE: Do NOT set Content-Type header - browser sets multipart boundary automatically
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to upload cover");
  }

  return response.json();
}
