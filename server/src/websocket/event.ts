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
    context: context,
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
    context: context,
    payload: message.payload,
  });

  broadcast(message);
}
