import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import http from "http";
import WebSocket from "ws";
import {
  initializeWebSocket,
  broadcast,
  getConnectedClientCount,
} from "./wsServer";

// ---- Mocks ----
vi.mock("../services/auth/sessionService", () => ({
  validateSession: vi.fn(),
}));

vi.mock("../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { validateSession } from "../services/auth/sessionService";

describe("WebSocket Server", () => {
  let server: http.Server;
  let wss: ReturnType<typeof initializeWebSocket>;
  let port: number;

  // ---- Setup server before each test ----
  beforeEach(async () => {
    server = http.createServer();
    wss = initializeWebSocket(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });

    const address = server.address();
    if (typeof address === "object" && address) {
      port = address.port;
    }
  });

  // ---- Cleanup after each test ----
  afterEach(async () => {
    wss.close();

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    vi.clearAllMocks();
  });

  // 8.2 WebSocket server initializes correctly
  it("initializes WebSocket server correctly", () => {
    expect(wss).toBeDefined();
  });

  // 8.3 Unauthenticated connection is rejected
  it("rejects unauthenticated connection", async () => {
    (validateSession as any).mockResolvedValue(null);

    await expect(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}`, {
          headers: {
            cookie: "session=invalidtoken",
          },
        });

        ws.on("open", () => reject("Should not connect"));
        ws.on("error", () => resolve(true));
      }),
    ).resolves.toBeTruthy();
  });

  // 8.4 Authenticated connection is accepted
  it("accepts authenticated connection", async () => {
    (validateSession as any).mockResolvedValue({
      user: { id: 123 },
    });

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`, {
        headers: {
          cookie: "session=validtoken",
        },
      });

      ws.on("open", () => {
        expect(getConnectedClientCount()).toBe(1);
        ws.close();
        resolve();
      });

      ws.on("error", reject);
    });
  });

  // 8.5 Broadcast sends to all connected clients
  it("broadcast sends message to all connected clients", async () => {
    (validateSession as any).mockResolvedValue({
      user: { id: 1 },
    });

    const ws1 = new WebSocket(`ws://localhost:${port}`, {
      headers: { cookie: "session=token1" },
    });

    const ws2 = new WebSocket(`ws://localhost:${port}`, {
      headers: { cookie: "session=token2" },
    });

    await Promise.all([
      new Promise((res) => ws1.on("open", res)),
      new Promise((res) => ws2.on("open", res)),
    ]);

    const messagePromise = new Promise<string>((resolve) => {
      ws1.on("message", (data) => resolve(data.toString()));
    });

    broadcast({
      type: "TEST",
      payload: { hello: "world" },
      timestamp: new Date().toISOString(),
    });

    const received = await messagePromise;
    const parsed = JSON.parse(received);

    expect(parsed.type).toBe("TEST");

    ws1.close();
    ws2.close();
  });

  // 8.6 Disconnect removes client from Set
  it("removes client from Set on disconnect", async () => {
    (validateSession as any).mockResolvedValue({
      user: { id: 5 },
    });

    const ws = new WebSocket(`ws://localhost:${port}`, {
      headers: { cookie: "session=token" },
    });

    await new Promise((res) => ws.on("open", res));

    expect(getConnectedClientCount()).toBe(1);

    ws.close();

    // wait a short moment for close event propagation
    await new Promise((res) => setTimeout(res, 50));

    expect(getConnectedClientCount()).toBe(0);
  });
});
