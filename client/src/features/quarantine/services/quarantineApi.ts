import type {
  QuarantineListResponse,
  ApproveQuarantineResponse,
} from "@/features/quarantine/index";

const API_BASE = "/api/v1/quarantine";

export async function fetchQuarantineItems(): Promise<QuarantineListResponse> {
  const response = await fetch(`${API_BASE}/`, {
    credentials: "include", // Session cookies
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to fetch quarantine items");
  }

  return response.json();
}

export async function fetchQuarantineCount(): Promise<{ count: number }> {
  const response = await fetch(`${API_BASE}/count`, {
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to fetch quarantine count");
  }

  const result = await response.json();
  return result.data;
}

/**
 * Approve a quarantined item and move it to the main library.
 * Changes status from 'quarantine' to 'enriched' and clears failure_reason.
 */
export async function approveQuarantineItem(
  bookId: number
): Promise<ApproveQuarantineResponse> {
  const response = await fetch(`${API_BASE}/${bookId}/approve`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to approve item");
  }

  return response.json();
}
