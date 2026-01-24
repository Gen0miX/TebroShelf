import { useEffect, useRef, useState, useCallback } from "react";

type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface UseWebSocketOptions {
  onMessage?: (event: MessageEvent) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
}

interface UseWebSocketReturn {
  status: ConnectionStatus;
  sendMessage: (data: string) => void;
  reconnect: () => void;
}

const MAX_RECONNECT_DELAY = 30000;
const INITIAL_RECONNECT_DELAY = 1000;

export function useWebSocket(
  url: string,
  options: UseWebSocketOptions = {},
): UseWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const connect = useCallback(() => {
    if (!url) return; // Don't connect with empty URL
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      reconnectAttemptRef.current = 0;
      optionsRef.current.onOpen?.();
    };

    ws.onmessage = (event) => {
      optionsRef.current.onMessage?.(event);
    };

    ws.onclose = () => {
      setStatus("disconnected");
      optionsRef.current.onClose?.();

      // Auto-reconnect with exponential backoff (only if URL is valid)
      if (url) {
        const delay = Math.min(
          INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttemptRef.current),
          MAX_RECONNECT_DELAY,
        );
        reconnectAttemptRef.current++;

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };

    ws.onerror = (error) => {
      optionsRef.current.onError?.(error);
    };
  }, [url]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  const sendMessage = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptRef.current = 0;
    connect();
  }, [connect, disconnect]);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { status, sendMessage, reconnect };
}
