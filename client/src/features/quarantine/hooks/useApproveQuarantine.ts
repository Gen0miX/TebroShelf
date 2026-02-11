import { useMutation, useQueryClient } from "@tanstack/react-query";
import { approveQuarantineItem } from "../services/quarantineApi";
import type { ApproveQuarantineResponse } from "../types";

export function useApproveQuarantine() {
  const queryClient = useQueryClient();

  return useMutation<ApproveQuarantineResponse, Error, number>({
    mutationFn: (bookId: number) => approveQuarantineItem(bookId),
    onSuccess: () => {
      // Invalidate both quarantine and books queries for real-time updates
      queryClient.invalidateQueries({ queryKey: ["quarantine"] });
      queryClient.invalidateQueries({ queryKey: ["quarantine", "count"] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });
}
