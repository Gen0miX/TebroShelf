import { useQuery } from "@tanstack/react-query";
import { fetchQuarantineItems } from "../services/quarantineApi";

export function useQuarantine() {
  return useQuery({
    queryKey: ["quarantine"],
    queryFn: fetchQuarantineItems,
  });
}
