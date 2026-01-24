import { createContext, useContext, type ReactNode } from "react";
import { useWebSocketEvents } from "@/shared/hooks/useWebSocketEvents";

type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface WebSocketContextValue {
  status: ConnectionStatus;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

interface WebSocketProviderProps {
  children: ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const { status } = useWebSocketEvents();

  return (
    <WebSocketContext.Provider value={{ status }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext(): WebSocketContextValue {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error(
      "useWebSocketContext must be used within a WebSocketProvider",
    );
  }
  return context;
}
