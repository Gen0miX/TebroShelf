// WebSocket Event Types - Story 2.6
// Single source of truth for WebSocket message types

export interface WebSocketMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp: string;
}

export interface FileDetectedPayload {
  filename: string;
  contentType: "book" | "manga";
  bookId: number;
  timestamp: string;
}

export interface ScanCompletedPayload {
  filesFound: number;
  filesProcessed: number;
  filesSkipped: number;
  errors: number;
  duration: number;
}

// Event type discriminator for type-safe handling
export type WebSocketEventType = "file.detected" | "scan.completed";

export function isFileDetectedMessage(
  message: WebSocketMessage,
): message is WebSocketMessage<FileDetectedPayload> {
  return message.type === "file.detected";
}

export function isScanCompletedMessage(
  message: WebSocketMessage,
): message is WebSocketMessage<ScanCompletedPayload> {
  return message.type === "scan.completed";
}
