import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApplyMetadataRequest } from "@/features/quarantine/index";
import { applyMetadata } from "../services/metadataSearchApi";

type UseApplyMetadataParams = {
  bookId: number;
  metadata: ApplyMetadataRequest;
};

export function useApplyMetadata() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ bookId, metadata }: UseApplyMetadataParams) =>
      applyMetadata(bookId, metadata),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["quarantine"],
      });
    },
  });

  return {
    mutate: mutation.mutate,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
  };
}
