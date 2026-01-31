import { useQuery } from "@tanstack/react-query";
import { fetchAvailableSources } from "../services/metadataSearchApi";

export function useAvailableSources() {
  return useQuery({
    queryKey: ["metadata", "sources"],
    queryFn: fetchAvailableSources,
    staleTime: Infinity,
  });
}
