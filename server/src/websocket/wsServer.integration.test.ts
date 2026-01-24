import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import http from "http";
import WebSocket from "ws";
import { initializeWebSocket, getConnectedClientCount } from "./wsServer";
import {
  emitFileDetected,
  emitScanCompleted,
  FileDetectedPayload,
  ScanCompletedPayload,
  WebSocketMessage,
} from "./event";

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

describe("WebSocket Integration Tests", () => {
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

    // Mock authenticated session
    (validateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 1 },
    });
  });

  // ---- Cleanup after each test ----
  afterEach(async () => {
    wss.close();

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    vi.clearAllMocks();
  });

  // Helper to create authenticated WebSocket client
  function createAuthenticatedClient(): WebSocket {
    return new WebSocket(`ws://localhost:${port}`, {
      headers: { cookie: "session=validtoken" },
    });
  }

  // Helper to wait for client connection
  function waitForConnection(ws: WebSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", reject);
    });
  }

  // Helper to wait for message
  function waitForMessage<T>(ws: WebSocket): Promise<WebSocketMessage<T>> {
    return new Promise((resolve) => {
      ws.on("message", (data) => {
        const message = JSON.parse(data.toString()) as WebSocketMessage<T>;
        resolve(message);
      });
    });
  }

  // 10.2 Test full flow: file detected → WebSocket event → client receives
  describe("file.detected event flow", () => {
    it("client receives file.detected event when emitFileDetected is called", async () => {
      const client = createAuthenticatedClient();
      await waitForConnection(client);

      const messagePromise = waitForMessage<FileDetectedPayload>(client);

      const payload: FileDetectedPayload = {
        filename: "test-book.epub",
        contentType: "book",
        bookId: 42,
        timestamp: new Date().toISOString(),
      };

      emitFileDetected(payload);

      const received = await messagePromise;

      expect(received.type).toBe("file.detected");
      expect(received.payload.filename).toBe("test-book.epub");
      expect(received.payload.contentType).toBe("book");
      expect(received.payload.bookId).toBe(42);
      expect(received.timestamp).toBeDefined();

      client.close();
    });

    it("file.detected event includes ISO 8601 timestamp", async () => {
      const client = createAuthenticatedClient();
      await waitForConnection(client);

      const messagePromise = waitForMessage<FileDetectedPayload>(client);

      emitFileDetected({
        filename: "manga-vol1.cbz",
        contentType: "manga",
        bookId: 100,
        timestamp: new Date().toISOString(),
      });

      const received = await messagePromise;

      // Verify timestamp is valid ISO 8601
      const parsedDate = new Date(received.timestamp);
      expect(parsedDate.toISOString()).toBe(received.timestamp);

      client.close();
    });
  });

  // 10.3 Test multiple clients receive same broadcast
  describe("multiple clients broadcast", () => {
    it("all connected clients receive file.detected event", async () => {
      const client1 = createAuthenticatedClient();
      const client2 = createAuthenticatedClient();
      const client3 = createAuthenticatedClient();

      await Promise.all([
        waitForConnection(client1),
        waitForConnection(client2),
        waitForConnection(client3),
      ]);

      expect(getConnectedClientCount()).toBe(3);

      const messagePromises = [
        waitForMessage<FileDetectedPayload>(client1),
        waitForMessage<FileDetectedPayload>(client2),
        waitForMessage<FileDetectedPayload>(client3),
      ];

      const payload: FileDetectedPayload = {
        filename: "shared-book.epub",
        contentType: "book",
        bookId: 999,
        timestamp: new Date().toISOString(),
      };

      emitFileDetected(payload);

      const [msg1, msg2, msg3] = await Promise.all(messagePromises);

      // All clients receive identical message
      expect(msg1.type).toBe("file.detected");
      expect(msg2.type).toBe("file.detected");
      expect(msg3.type).toBe("file.detected");

      expect(msg1.payload.bookId).toBe(999);
      expect(msg2.payload.bookId).toBe(999);
      expect(msg3.payload.bookId).toBe(999);

      // Timestamps should be identical (same broadcast)
      expect(msg1.timestamp).toBe(msg2.timestamp);
      expect(msg2.timestamp).toBe(msg3.timestamp);

      client1.close();
      client2.close();
      client3.close();
    });

    it("all connected clients receive scan.completed event", async () => {
      const client1 = createAuthenticatedClient();
      const client2 = createAuthenticatedClient();

      await Promise.all([
        waitForConnection(client1),
        waitForConnection(client2),
      ]);

      const messagePromises = [
        waitForMessage<ScanCompletedPayload>(client1),
        waitForMessage<ScanCompletedPayload>(client2),
      ];

      const payload: ScanCompletedPayload = {
        filesFound: 50,
        filesProcessed: 45,
        filesSkipped: 3,
        errors: 2,
        duration: 12500,
      };

      emitScanCompleted(payload);

      const [msg1, msg2] = await Promise.all(messagePromises);

      expect(msg1.type).toBe("scan.completed");
      expect(msg2.type).toBe("scan.completed");

      expect(msg1.payload.filesProcessed).toBe(45);
      expect(msg2.payload.filesProcessed).toBe(45);

      client1.close();
      client2.close();
    });
  });

  // 10.4 Test scan.completed event broadcast
  describe("scan.completed event flow", () => {
    it("client receives scan.completed event when emitScanCompleted is called", async () => {
      const client = createAuthenticatedClient();
      await waitForConnection(client);

      const messagePromise = waitForMessage<ScanCompletedPayload>(client);

      const payload: ScanCompletedPayload = {
        filesFound: 100,
        filesProcessed: 95,
        filesSkipped: 5,
        errors: 0,
        duration: 30000,
      };

      emitScanCompleted(payload);

      const received = await messagePromise;

      expect(received.type).toBe("scan.completed");
      expect(received.payload.filesFound).toBe(100);
      expect(received.payload.filesProcessed).toBe(95);
      expect(received.payload.filesSkipped).toBe(5);
      expect(received.payload.errors).toBe(0);
      expect(received.payload.duration).toBe(30000);
      expect(received.timestamp).toBeDefined();

      client.close();
    });

    it("scan.completed payload matches ScanCompletedPayload interface", async () => {
      const client = createAuthenticatedClient();
      await waitForConnection(client);

      const messagePromise = waitForMessage<ScanCompletedPayload>(client);

      emitScanCompleted({
        filesFound: 10,
        filesProcessed: 8,
        filesSkipped: 1,
        errors: 1,
        duration: 5000,
      });

      const received = await messagePromise;

      // Verify all required fields exist and are correct types
      expect(typeof received.payload.filesFound).toBe("number");
      expect(typeof received.payload.filesProcessed).toBe("number");
      expect(typeof received.payload.filesSkipped).toBe("number");
      expect(typeof received.payload.errors).toBe("number");
      expect(typeof received.payload.duration).toBe("number");

      client.close();
    });

    it("scan.completed event triggers after force scan completes", async () => {
      // Simulates Story 2.5 force scan → emitScanCompleted flow
      const client = createAuthenticatedClient();
      await waitForConnection(client);

      const messagePromise = waitForMessage<ScanCompletedPayload>(client);

      // Simulate scan results from force scan
      const scanResults: ScanCompletedPayload = {
        filesFound: 25,
        filesProcessed: 20,
        filesSkipped: 3,
        errors: 2,
        duration: 8500,
      };

      emitScanCompleted(scanResults);

      const received = await messagePromise;

      expect(received.type).toBe("scan.completed");
      expect(received.payload).toEqual(scanResults);

      client.close();
    });
  });

  // Additional edge case tests
  describe("edge cases", () => {
    it("broadcast does not throw error regardless of client count", () => {
      // Should not throw even if clients Set has stale connections
      // or is empty - broadcast handles both cases gracefully
      expect(() => {
        emitFileDetected({
          filename: "orphan.epub",
          contentType: "book",
          bookId: 1,
          timestamp: new Date().toISOString(),
        });
      }).not.toThrow();

      expect(() => {
        emitScanCompleted({
          filesFound: 0,
          filesProcessed: 0,
          filesSkipped: 0,
          errors: 0,
          duration: 0,
        });
      }).not.toThrow();
    });

    it("disconnected client does not receive subsequent broadcasts", async () => {
      const client1 = createAuthenticatedClient();
      const client2 = createAuthenticatedClient();

      await Promise.all([
        waitForConnection(client1),
        waitForConnection(client2),
      ]);

      expect(getConnectedClientCount()).toBe(2);

      // Disconnect client1
      client1.close();
      await new Promise((res) => setTimeout(res, 50));

      expect(getConnectedClientCount()).toBe(1);

      // Only client2 should receive message
      const messagePromise = waitForMessage<FileDetectedPayload>(client2);

      emitFileDetected({
        filename: "after-disconnect.epub",
        contentType: "book",
        bookId: 777,
        timestamp: new Date().toISOString(),
      });

      const received = await messagePromise;
      expect(received.payload.bookId).toBe(777);

      client2.close();
    });
  });
});
