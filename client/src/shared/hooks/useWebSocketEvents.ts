import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "./useWebSocket";
import { useAuth } from "@/features/auth";
import { toast } from "@/shared/hooks/use-toast";
import type {
  WebSocketMessage,
  FileDetectedPayload,
  ScanCompletedPayload,
  EnrichmentFailedPayload,
  BookUpdatedPayload,
} from "@/shared/types/websocket";
import {
  isEnrichmentFailedMessage,
  isFileDetectedMessage,
  isScanCompletedMessage,
  isBookUpdatedMessage,
} from "@/shared/types/websocket";

export function useWebSocketEvents() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

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
        } else if (isEnrichmentFailedMessage(message)) {
          const payload = message.payload as EnrichmentFailedPayload;
          // Invalidate quarantine queries for real-time refresh (list and count)
          queryClient.invalidateQueries({ queryKey: ["quarantine"] });
          queryClient.invalidateQueries({ queryKey: ["quarantine", "count"] });

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
    [queryClient],
  );

  const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;

  const { status } = useWebSocket(isAuthenticated ? wsUrl : "", {
    onMessage: handleMessage,
    onOpen: () => console.log("WebSocket connected"),
    onClose: () => console.log("WebSocket disconnected"),
  });

  return { status };
}
