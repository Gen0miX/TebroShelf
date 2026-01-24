import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import { parse as parseCookie } from "cookie";
import { validateSession } from "../services/auth/sessionService";
import { logger } from "../utils/logger";

interface AuthenticatedWebSocket extends WebSocket {
  userId: number;
  isAlive: boolean;
}

const clients = new Set<AuthenticatedWebSocket>();
const context = "wsServer";

export function initializeWebSocket(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests
  server.on("upgrade", async (request, socket, head) => {
    try {
      // Extract session cookie
      const cookies = parseCookie(request.headers.cookie || "");
      const sessionToken = cookies["session"];

      if (!sessionToken) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      // Validate session
      const session = await validateSession(sessionToken);
      if (!session) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      // Upgrade connection
      wss.handleUpgrade(request, socket, head, (ws) => {
        const authenticatedWs = ws as AuthenticatedWebSocket;
        authenticatedWs.userId = session.user.id;
        authenticatedWs.isAlive = true;
        wss.emit("connection", authenticatedWs, request);
      });
    } catch (err) {
      logger.error("WebSocket upgrade error", {
        context: context,
        error: err,
      });
      socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
      socket.destroy();
    }
  });

  wss.on("connection", (ws: AuthenticatedWebSocket) => {
    clients.add(ws);
    logger.info("WebSocket client connected", {
      context: context,
      userId: ws.userId,
      totalClients: clients.size,
    });

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("close", () => {
      clients.delete(ws);
      logger.info("WebSocket client disconnected", {
        context: context,
        userId: ws.userId,
        totalClients: clients.size,
      });
    });

    ws.on("error", (err) => {
      logger.error("WebSocket client error", {
        context: context,
        userId: ws.userId,
        error: err,
      });
      clients.delete(ws);
    });
  });

  // HeartBeat interval (30 seconds)
  const heartBeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const authWs = ws as AuthenticatedWebSocket;
      if (!authWs.isAlive) {
        clients.delete(authWs);
        return authWs.terminate();
      }
      authWs.isAlive = false;
      authWs.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(heartBeatInterval);
  });

  return wss;
}

export function broadcast<T>(message: {
  type: string;
  payload: T;
  timestamp: string;
}): void {
  const messageStr = JSON.stringify(message);

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr, (err) => {
        if (err) {
          logger.error("WebSocket send error", {
            context: context,
            error: err,
          });
          clients.delete(client);
        }
      });
    }
  });
  logger.debug("WebSocket broadcast", {
    context: context,
    type: message.type,
    clientCount: clients.size,
  });
}

export function getConnectedClientCount(): number {
  return clients.size;
}
