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

export interface EnrichmentStartedPayload {
  bookId: number;
  step: "started";
  details?: {
    contentType?: string;
    [key: string]: unknown;
  };
}

export interface EnrichmentProgressPayload {
  bookId: number;
  step: string;
  details?: Record<string, unknown>;
}

export interface EnrichmentCompletedPayload {
  bookId: number;
  step: "completed";
  details?: {
    source?: string;
    fieldsUpdated?: string[];
    contentType?: string;
    [key: string]: unknown;
  };
}

export interface EnrichmentFailedPayload {
  bookId: number;
  failureReason: string;
  contentType: string;
  sourcesAttempted: string[];
}

export interface BookUpdatedPayload {
  bookId: number;
  details?: Record<string, unknown>;
}

// Event type discriminator for type-safe handling
export type WebSocketEventType =
  | "file.detected"
  | "scan.completed"
  | "enrichment.started"
  | "enrichment.progress"
  | "enrichment.completed"
  | "enrichment.failed"
  | "book.updated";

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

export function isEnrichmentStartedMessage(
  message: WebSocketMessage,
): message is WebSocketMessage<EnrichmentStartedPayload> {
  return message.type === "enrichment.started";
}

export function isEnrichmentProgressMessage(
  message: WebSocketMessage,
): message is WebSocketMessage<EnrichmentProgressPayload> {
  return message.type === "enrichment.progress";
}

export function isEnrichmentCompletedMessage(
  message: WebSocketMessage,
): message is WebSocketMessage<EnrichmentCompletedPayload> {
  return message.type === "enrichment.completed";
}

export function isEnrichmentFailedMessage(
  message: WebSocketMessage,
): message is WebSocketMessage<EnrichmentFailedPayload> {
  return message.type === "enrichment.failed";
}

export function isBookUpdatedMessage(
  message: WebSocketMessage,
): message is WebSocketMessage<BookUpdatedPayload> {
  return message.type === "book.updated";
}
