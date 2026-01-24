import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocket } from "./useWebSocket";

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.CONNECTING;

  onopen: (() => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: any) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {}

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }

  // Manual trigger methods for test control
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen();
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }

  simulateMessage(data: any) {
    if (this.onmessage) this.onmessage({ data } as MessageEvent);
  }

  simulateError(error: any) {
    if (this.onerror) this.onerror(error);
  }
}

describe("useWebSocket hook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.WebSocket = MockWebSocket as any;
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("connects to WebSocket server", () => {
    const { result } = renderHook(() => useWebSocket("ws://test-server"));

    // Initial state should be "connecting"
    expect(result.current.status).toBe("connecting");
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toBe("ws://test-server");

    // Simulate successful connection
    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    expect(result.current.status).toBe("connected");
  });

  it("auto reconnects on disconnect", () => {
    const { result } = renderHook(() => useWebSocket("ws://reconnect-test"));

    // Connect first
    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });
    expect(result.current.status).toBe("connected");

    // Simulate disconnect
    act(() => {
      MockWebSocket.instances[0].simulateClose();
    });
    expect(result.current.status).toBe("disconnected");

    // Advance timer for first reconnect attempt (1000ms)
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Should have created a new WebSocket instance
    expect(MockWebSocket.instances.length).toBe(2);
  });

  it("uses exponential backoff for reconnect delays", () => {
    renderHook(() => useWebSocket("ws://backoff-test"));

    // 1st connection attempt fails immediately (close without open)
    // reconnectAttempt: 0 -> 1, delay = 1000 * 2^0 = 1000ms
    act(() => {
      MockWebSocket.instances[0].simulateClose();
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockWebSocket.instances.length).toBe(2);

    // 2nd connection attempt also fails
    // reconnectAttempt: 1 -> 2, delay = 1000 * 2^1 = 2000ms
    act(() => {
      MockWebSocket.instances[1].simulateClose();
    });

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(MockWebSocket.instances.length).toBe(2); // Not yet reconnected

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(MockWebSocket.instances.length).toBe(3); // Reconnected after 2000ms!
  });

  it("calls onMessage callback when message is received", () => {
    const onMessage = vi.fn();
    renderHook(() => useWebSocket("ws://message-test", { onMessage }));

    // Connect first
    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    // Simulate receiving a message
    act(() => {
      MockWebSocket.instances[0].simulateMessage("hello");
    });

    expect(onMessage).toHaveBeenCalled();
    expect(onMessage.mock.calls[0][0].data).toBe("hello");
  });
});
