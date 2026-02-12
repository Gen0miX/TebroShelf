import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "./useWebSocket";
import { useAuth } from "@/features/auth";
import { toast } from "@/shared/hooks/use-toast";
import { useEnrichmentProgress } from "@/shared/providers/EnrichmentProgressContext";
import type {
  WebSocketMessage,
  FileDetectedPayload,
  ScanCompletedPayload,
  EnrichmentCompletedPayload,
  EnrichmentFailedPayload,
  BookUpdatedPayload,
} from "@/shared/types/websocket";
import {
  isEnrichmentStartedMessage,
  isEnrichmentProgressMessage,
  isEnrichmentCompletedMessage,
  isEnrichmentFailedMessage,
  isFileDetectedMessage,
  isScanCompletedMessage,
  isBookUpdatedMessage,
} from "@/shared/types/websocket";

export function useWebSocketEvents() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { updateEnrichment, removeEnrichment } = useEnrichmentProgress();

  // Track timeouts for auto-cleanup
  const cleanupTimeouts = useRef<Map<number, NodeJS.Timeout>>(new Map());

  const scheduleCleanup = useCallback(
    (bookId: number, delayMs: number) => {
      // Clear any existing timeout for this book
      const existing = cleanupTimeouts.current.get(bookId);
      if (existing) {
        clearTimeout(existing);
      }

      // Schedule new cleanup
      const timeout = setTimeout(() => {
        removeEnrichment(bookId);
        cleanupTimeouts.current.delete(bookId);
      }, delayMs);

      cleanupTimeouts.current.set(bookId, timeout);
    },
    [removeEnrichment],
  );

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        if (isFileDetectedMessage(message)) {
          const payload = message.payload as FileDetectedPayload;
          // Invalidate books query to refresh library
          queryClient.invalidateQueries({ queryKey: ["books"] });

          toast({
            title: "New content detected",
            description: `${payload.filename} (${payload.contentType})`,
          });
        } else if (isScanCompletedMessage(message)) {
          const payload = message.payload as ScanCompletedPayload;
          // Invalidate books query to refresh library
          queryClient.invalidateQueries({ queryKey: ["books"] });

          if (payload.filesProcessed > 0) {
            toast({
              title: "Scan complete",
              description: `${payload.filesProcessed} new file(s) added`,
            });
          } else {
            toast({
              title: "Scan complete",
              description: "No new files found",
            });
          }
        } else if (isEnrichmentStartedMessage(message)) {
          // Story 3.14 AC#4: Toast when enrichment starts + update context
          const bookId = message.payload.bookId;

          updateEnrichment(bookId, {
            currentStep: "started",
            status: "in-progress",
          });

          toast({
            title: "Enrichment started",
            description: `Processing book #${bookId}...`,
          });
        } else if (isEnrichmentProgressMessage(message)) {
          // Story 3.14 AC#2: Progress events update context only (no toast - too noisy)
          const { bookId, step } = message.payload;

          updateEnrichment(bookId, {
            currentStep: step,
            status: "in-progress",
          });
        } else if (isEnrichmentCompletedMessage(message)) {
          // Story 3.14 AC#5: Toast with source, invalidate books query, update context
          const payload = message.payload as EnrichmentCompletedPayload;
          const bookId = payload.bookId;
          const source = payload.details?.source ?? "enrichment";

          updateEnrichment(bookId, {
            currentStep: "completed",
            status: "completed",
            source,
          });

          // Auto-remove completed after 5 seconds
          scheduleCleanup(bookId, 5000);

          queryClient.invalidateQueries({ queryKey: ["books"] });

          toast({
            title: "Enrichment complete",
            description: `Book #${bookId} enriched from ${source}`,
          });
        } else if (isEnrichmentFailedMessage(message)) {
          const payload = message.payload as EnrichmentFailedPayload;
          const bookId = payload.bookId;

          updateEnrichment(bookId, {
            currentStep: "enrichment-failed",
            status: "failed",
            reason: payload.failureReason,
          });

          // Auto-remove failed after 8 seconds
          scheduleCleanup(bookId, 8000);

          // Invalidate quarantine queries for real-time refresh (list and count)
          queryClient.invalidateQueries({ queryKey: ["quarantine"] });
          queryClient.invalidateQueries({ queryKey: ["quarantine", "count"] });
          // Also invalidate books query
          queryClient.invalidateQueries({ queryKey: ["books"] });

          toast({
            variant: "destructive",
            title: "Enrichment failed",
            description: `${payload.contentType} moved to quarantine: ${payload.failureReason}`,
          });
        } else if (isBookUpdatedMessage(message)) {
          // Invalidate quarantine queries when books are updated (e.g., moved out of quarantine)
          queryClient.invalidateQueries({ queryKey: ["quarantine"] });
          queryClient.invalidateQueries({ queryKey: ["quarantine", "count"] });
          // Also invalidate books query for library refresh
          queryClient.invalidateQueries({ queryKey: ["books"] });
        } else {
          console.log("Unknown WebSocket event:", message.type);
        }
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    },
    [queryClient, updateEnrichment, scheduleCleanup],
  );

  const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;

  const { status } = useWebSocket(isAuthenticated ? wsUrl : "", {
    onMessage: handleMessage,
    onOpen: () => console.log("WebSocket connected"),
    onClose: () => console.log("WebSocket disconnected"),
  });

  return { status };
}
