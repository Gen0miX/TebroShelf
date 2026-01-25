import { useMutation, useQueryClient } from "@tanstack/react-query";
import { triggerForceScan } from "../services/adminApi";
import type { ScanResult } from "../services/adminApi";

export function useForceScan() {
  const queryClient = useQueryClient();

  return useMutation<ScanResult, Error>({
    mutationFn: triggerForceScan,
    onSuccess: () => {
      // Invalidate book queries to refresh library with new files
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });
}
