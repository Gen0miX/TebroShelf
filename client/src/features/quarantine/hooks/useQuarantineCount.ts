import { useQuery } from "@tanstack/react-query";
import { fetchQuarantineCount } from "../services/quarantineApi";

export function useQuarantineCount() {
  return useQuery({
    queryKey: ["quarantine", "count"],
    queryFn: fetchQuarantineCount,
    // Poll every 60s as backup to WebSocket updates
    refetchInterval: 60000,
  });
}
