import { describe, it, expect, beforeEach, vi } from "vitest";
import { IpcShellConnector } from "@openp41ge-terminal/shell/ipc-shell-connector";

describe("IpcShellConnector", () => {
  let mockTerminalAPI: ReturnType<typeof createMockAPI>;

  function createMockAPI() {
    const listeners = new Map<string, Set<(data: string) => void>>();
    const exitListeners = new Map<string, Set<(code: number | null) => void>>();

    return {
      spawn: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn((paneId: string, cb: (data: string) => void) => {
        if (!listeners.has(paneId)) listeners.set(paneId, new Set());
        listeners.get(paneId)!.add(cb);
        return () => listeners.get(paneId)?.delete(cb);
      }),
      onExit: vi.fn((paneId: string, cb: (code: number | null) => void) => {
        if (!exitListeners.has(paneId)) exitListeners.set(paneId, new Set());
        exitListeners.get(paneId)!.add(cb);
        return () => exitListeners.get(paneId)?.delete(cb);
      }),
      // Testing helpers
      _fireData(paneId: string, data: string) {
        listeners.get(paneId)?.forEach((cb) => cb(data));
      },
      _fireExit(paneId: string, code: number | null) {
        exitListeners.get(paneId)?.forEach((cb) => cb(code));
      },
    };
  }

  beforeEach(() => {
    mockTerminalAPI = createMockAPI();
    const _global = globalThis as unknown as { window: Record<string, unknown> };
    _global.window = {
      openp41ge: {
        terminal: mockTerminalAPI,
      },
    };
  });

  afterEach(() => {
    const _global = globalThis as unknown as { window: Record<string, unknown> };
    delete _global.window;
  });

  it("isAvailable returns true when window.openp41ge.terminal exists", () => {
    expect(IpcShellConnector.isAvailable()).toBe(true);
  });

  it("isAvailable returns false when window.openp41ge.terminal is missing", () => {
    const _global = globalThis as unknown as { window: Record<string, unknown> };
    delete (_global.window as Record<string, unknown>).openp41ge;
    expect(IpcShellConnector.isAvailable()).toBe(false);
  });

  it("isAvailable returns false when window is undefined", () => {
    const _global = globalThis as unknown as { window: Record<string, unknown> };
    delete _global.window;
    expect(IpcShellConnector.isAvailable()).toBe(false);
  });

  it("spawn calls window.openp41ge.terminal.spawn and subscribes to output/exit", () => {
    const connector = new IpcShellConnector("test-pane");

    connector.spawn();

    expect(mockTerminalAPI.spawn).toHaveBeenCalledWith("test-pane");
    expect(mockTerminalAPI.onData).toHaveBeenCalledWith("test-pane", expect.any(Function));
    expect(mockTerminalAPI.onExit).toHaveBeenCalledWith("test-pane", expect.any(Function));
  });

  it("write forwards data to window.openp41ge.terminal.write", () => {
    const connector = new IpcShellConnector("test-pane");

    connector.write("ls -la\r");

    expect(mockTerminalAPI.write).toHaveBeenCalledWith("test-pane", "ls -la\r");
  });

  it("resize forwards dimensions", () => {
    const connector = new IpcShellConnector("test-pane");

    connector.resize(120, 40);

    expect(mockTerminalAPI.resize).toHaveBeenCalledWith("test-pane", 120, 40);
  });

  it("kill calls window.openp41ge.terminal.kill and clears listeners", () => {
    const connector = new IpcShellConnector("test-pane");
    const outputHandler = vi.fn();

    connector.onOutput(outputHandler);
    connector.spawn();
    connector.kill();

    expect(mockTerminalAPI.kill).toHaveBeenCalledWith("test-pane");

    // After kill, output should no longer fire
    mockTerminalAPI._fireData("test-pane", "should not fire");
    expect(outputHandler).not.toHaveBeenCalled();
  });

  it("onOutput delivers shell output to registered callbacks", () => {
    const connector = new IpcShellConnector("test-pane");
    const handler = vi.fn();

    connector.onOutput(handler);
    connector.spawn();

    mockTerminalAPI._fireData("test-pane", "hello\r\n");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("hello\r\n");
  });

  it("onOutput supports multiple listeners", () => {
    const connector = new IpcShellConnector("test-pane");
    const h1 = vi.fn();
    const h2 = vi.fn();

    connector.onOutput(h1);
    connector.onOutput(h2);
    connector.spawn();

    mockTerminalAPI._fireData("test-pane", "data");

    expect(h1).toHaveBeenCalledWith("data");
    expect(h2).toHaveBeenCalledWith("data");
  });

  it("onExit delivers exit code to registered callbacks", () => {
    const connector = new IpcShellConnector("test-pane");
    const handler = vi.fn();

    connector.onExit(handler);
    connector.spawn();

    mockTerminalAPI._fireExit("test-pane", 0);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(0);
  });

  it("onOutput unsubscribe stops receiving data", () => {
    const connector = new IpcShellConnector("test-pane");
    const handler = vi.fn();

    const unsub = connector.onOutput(handler);
    connector.spawn();

    mockTerminalAPI._fireData("test-pane", "first");
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();

    mockTerminalAPI._fireData("test-pane", "second");
    expect(handler).toHaveBeenCalledTimes(1); // no additional call
  });

  it("onExit unsubscribe stops receiving exit events", () => {
    const connector = new IpcShellConnector("test-pane");
    const handler = vi.fn();

    const unsub = connector.onExit(handler);
    connector.spawn();

    unsub();

    mockTerminalAPI._fireExit("test-pane", 0);
    expect(handler).not.toHaveBeenCalled();
  });

  it("exposes paneId", () => {
    const connector = new IpcShellConnector("my-pane-42");
    expect(connector.paneId).toBe("my-pane-42");
  });

  it("spawn is idempotent (subscribes only once)", () => {
    const connector = new IpcShellConnector("test-pane");

    connector.spawn();
    connector.spawn();

    expect(mockTerminalAPI.spawn).toHaveBeenCalledTimes(2);
    expect(mockTerminalAPI.onData).toHaveBeenCalledTimes(1);
    expect(mockTerminalAPI.onExit).toHaveBeenCalledTimes(1);
  });

  it("does not throw when window.openp41ge.terminal is missing", () => {
    const _global = globalThis as unknown as { window: Record<string, unknown> };
    delete (_global.window as Record<string, unknown>).openp41ge;
    const connector = new IpcShellConnector("test-pane");

    expect(() => connector.spawn()).not.toThrow();
    expect(() => connector.write("test")).not.toThrow();
    expect(() => connector.resize(80, 24)).not.toThrow();
    expect(() => connector.kill()).not.toThrow();
  });
});
