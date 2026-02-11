import { useMutation, useQueryClient } from "@tanstack/react-query";
import { editMetadata } from "../services/metadataEditApi";
import type { EditMetadataRequest, EditMetadataResponse } from "../types";

interface EditMetadataVariables {
  bookId: number;
  data: EditMetadataRequest;
}

/**
 * React Query mutation hook for editing book metadata
 * Invalidates book and quarantine queries on success
 */
export function useEditMetadata() {
  const queryClient = useQueryClient();

  return useMutation<EditMetadataResponse, Error, EditMetadataVariables>({
    mutationFn: ({ bookId, data }) => editMetadata(bookId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["books"] });
      queryClient.invalidateQueries({ queryKey: ["quarantine"] });
      queryClient.invalidateQueries({ queryKey: ["book", variables.bookId] });
    },
  });
}
