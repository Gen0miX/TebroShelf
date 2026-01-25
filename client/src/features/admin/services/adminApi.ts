export interface ScanResult {
  filesFound: number;
  filesProcessed: number;
  filesSkipped: number;
  errors: number;
  duration: number;
}

export async function triggerForceScan(): Promise<ScanResult> {
  const response = await fetch("/api/v1/admin/scan", {
    method: "POST",
    credentials: "include", // Important for session cookies
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Scan failed");
  }

  const data = await response.json();
  return data.data;
}
