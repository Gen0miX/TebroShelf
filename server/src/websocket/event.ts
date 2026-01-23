import { logger } from "../utils/logger.js";

// Event type definitions following architecture pattern: resource.action
export interface FileDetectedPayload {
  filename: string;
  contentType: "book" | "manga";
  bookId: number;
  timestamp: string; // ISO 8601
}

export interface WebSocketMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp: string;
}

/**
 * Emit file.detected event.
 * Note: WebSocket server implementation will be enhanced in Story 2.6.
 * For now, this logs the event and prepares the message structure.
 */
export function emitFileDetected(payload: FileDetectedPayload): void {
  const message: WebSocketMessage<FileDetectedPayload> = {
    type: "file.detected",
    payload,
    timestamp: new Date().toISOString(),
  };

  logger.info("WebSocket event emitted", {
    context: "websocket",
    eventType: message.type,
    payload: message.payload,
  });

  //TODO: Actual WebSocket broadcast will be implemented in Story 2.6
  //wsServer.broadcast(JSON.stringify(message));
}
