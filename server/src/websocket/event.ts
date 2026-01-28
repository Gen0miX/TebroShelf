import { logger } from "../utils/logger";
import { broadcast } from "./wsServer";

const context = "websocket";

// Event type definitions following architecture pattern: resource.action
export interface FileDetectedPayload {
  filename: string;
  contentType: "book" | "manga";
  bookId: number;
  timestamp: string; // ISO 8601
}

export interface ScanCompletedPayload {
  filesFound: number;
  filesProcessed: number;
  filesSkipped: number;
  errors: number;
  duration: number;
}

export interface EnrichmentProgressPayload {
  bookId: number;
  step: string;
  details?: Record<string, unknown>;
}

export interface EnrichmentFailedPayload {
  bookId: number;
  failureReason: string;
  contentType: string;
  sourcesAttempted: string[];
}

export interface WebSocketMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp: string;
}

/**
 * Emit file.detected event.
 */
export function emitFileDetected(payload: FileDetectedPayload): void {
  const message: WebSocketMessage<FileDetectedPayload> = {
    type: "file.detected",
    payload,
    timestamp: new Date().toISOString(),
  };

  logger.info("Emitting file.detected event", {
    context,
    payload: message.payload,
  });

  broadcast(message);
}

/**
 * Emit scan.completed event to all connected clients.
 */
export function emitScanCompleted(payload: ScanCompletedPayload): void {
  const message: WebSocketMessage<ScanCompletedPayload> = {
    type: "scan.completed",
    payload,
    timestamp: new Date().toISOString(),
  };

  logger.info("Emitting scan.completed event", {
    context,
    payload: message.payload,
  });

  broadcast(message);
}

/**
 * Emit enrichment.started event
 */
export function emitEnrichmentStarted(
  bookId: number,
  details?: Record<string, unknown>,
): void {
  const message: WebSocketMessage<EnrichmentProgressPayload> = {
    type: "enrichment.started",
    payload: { bookId, step: "started", details },
    timestamp: new Date().toISOString(),
  };

  logger.info("Emitting enrichment.started event", {
    context,
    payload: message.payload,
  });

  broadcast(message);
}

/**
 * Emit enrichment.progress event
 */
export function emitEnrichmentProgress(
  bookId: number,
  step: string,
  details?: Record<string, unknown>,
): void {
  const message: WebSocketMessage<EnrichmentProgressPayload> = {
    type: "enrichment.progress",
    payload: { bookId, step, details },
    timestamp: new Date().toISOString(),
  };

  logger.info("Emitting enrichment.progress event", {
    context,
    payload: message.payload,
  });

  broadcast(message);
}

/**
 * Emit enrichment.completed event
 */
export function emitEnrichmentCompleted(
  bookId: number,
  details?: Record<string, unknown>,
): void {
  const message: WebSocketMessage<EnrichmentProgressPayload> = {
    type: "enrichment.completed",
    payload: { bookId, step: "completed", details },
    timestamp: new Date().toISOString(),
  };

  logger.info("Emitting enrichment.completed event", {
    context,
    payload: message.payload,
  });

  broadcast(message);
}

/**
 * Emit enrichment.failed event when a book enters quarantine
 */
export function emitEnrichmentFailed(
  bookId: number,
  failureReason: string,
  contentType: string,
  sourcesAttempted: string[],
): void {
  const message: WebSocketMessage<EnrichmentFailedPayload> = {
    type: "enrichment.failed",
    payload: { bookId, failureReason, contentType, sourcesAttempted },
    timestamp: new Date().toISOString(),
  };

  logger.info("Emitting enrichment.failed event", {
    context,
    payload: message.payload,
  });

  broadcast(message);
}
