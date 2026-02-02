import type {
  MetadataSearchResult,
  MetadataSource,
  ApplyMetadataRequest,
  ApplyMetadataResponse,
} from "@/features/quarantine/index";

const API_BASE = "/api/v1/metadata";

export async function searchMetadata(
  query: string,
  source: MetadataSource,
): Promise<MetadataSearchResult[]> {
  const url = new URL(`${API_BASE}/search`, window.location.origin);

  url.searchParams.set("query", query);
  url.searchParams.set("source", source);

  const response = await fetch(url.toString(), {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to fetch metadata");
  }

  const result = await response.json();
  return result.data;
}

export async function fetchAvailableSources(): Promise<MetadataSource[]> {
  const response = await fetch(`${API_BASE}/sources`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to fetch metadata sources");
  }

  const result = await response.json();
  return result.data;
}

export async function applyMetadata(
  bookId: number,
  metadata: ApplyMetadataRequest,
): Promise<ApplyMetadataResponse> {
  const response = await fetch(`${API_BASE}/${bookId}/apply`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to apply metadata");
  }

  const result = await response.json();
  return result.data;
}
