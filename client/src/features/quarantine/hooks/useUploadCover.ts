import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadCover } from "../services/metadataEditApi";
import type { CoverUploadResponse } from "../types";

interface UploadCoverVariables {
  bookId: number;
  file: File;
}

/**
 * React Query mutation hook for uploading book cover images
 * Invalidates book and quarantine queries on success
 */
export function useUploadCover() {
  const queryClient = useQueryClient();

  return useMutation<CoverUploadResponse, Error, UploadCoverVariables>({
    mutationFn: ({ bookId, file }) => uploadCover(bookId, file),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["books"] });
      queryClient.invalidateQueries({ queryKey: ["quarantine"] });
      queryClient.invalidateQueries({ queryKey: ["book", variables.bookId] });
    },
  });
}
