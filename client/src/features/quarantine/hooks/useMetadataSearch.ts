import { useQuery } from "@tanstack/react-query";
import { searchMetadata } from "../services/metadataSearchApi";
import type {
  MetadataSource,
  MetadataSearchOptions,
} from "@/features/quarantine/index";

export function useMetadataSearch(
  query: string,
  source: MetadataSource,
  options?: MetadataSearchOptions,
) {
  return useQuery({
    queryKey: ["metadata", "search", query, source, options?.language],
    queryFn: () => searchMetadata(query, source, options),
    enabled: false, // Manual trigger via refetch();
    staleTime: 5 * 60 * 1000, // Cache results for 5 minutes (avoid re-querying APIs)
    retry: 1, // One retry on failure
  });
}
