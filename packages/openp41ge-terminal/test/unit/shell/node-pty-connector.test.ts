import { describe, it, expect, beforeEach, vi } from "vitest";
import { NodePtyConnector } from "@openp41ge-terminal/shell/node-pty-connector";

/**
 * Create a fake node-pty module for testing.
 */
function createFakeNodePty() {
  const callbacks: Array<(data: string) => void> = [];
  const exitCallbacks: Array<{
    cb: (info: { exitCode: number | null }) => void;
  }> = [];

  let ptyInstance: any = null;
  const mockKill = vi.fn(() => {
    for (const entry of exitCallbacks) entry.cb({ exitCode: -1 });
    exitCallbacks.length = 0;
    callbacks.length = 0;
  });

  return {
    // The module itself
    spawn: vi.fn((shell: string, args: string[], options: any) => {
      ptyInstance = {
        onData: (cb: (data: string) => void) => callbacks.push(cb),
        onExit: (cb: (info: { exitCode: number | null }) => void) => exitCallbacks.push({ cb }),
        write: vi.fn(),
        resize: vi.fn((cols: number, rows: number) => {
          ptyInstance.cols = cols;
          ptyInstance.rows = rows;
        }),
        kill: mockKill,
        cols: options.cols ?? 80,
        rows: options.rows ?? 24,
        _exited: false,
      };
      return ptyInstance;
    }),
    // Testing helpers
    _fireOutput(data: string) {
      for (const cb of callbacks) cb(data);
    },
    _fireExit(code: number | null) {
      for (const entry of exitCallbacks) entry.cb({ exitCode: code });
      exitCallbacks.length = 0;
    },
    _getPty() {
      return ptyInstance;
    },
    _reset() {
      callbacks.length = 0;
      exitCallbacks.length = 0;
      ptyInstance = null;
      this.spawn.mockClear();
      mockKill.mockClear();
    },
  };
}

describe("NodePtyConnector", () => {
  let fakePty: ReturnType<typeof createFakeNodePty>;

  beforeEach(() => {
    fakePty = createFakeNodePty();
  });

  it("can be constructed", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty });
    expect(connector).toBeTruthy();
  });

  it("throws on spawn when node-pty is not available", () => {
    const connector = new NodePtyConnector();
    expect(() => connector.spawn()).toThrow("node-pty is not available");
  });

  it("spawns a shell via the injected node-pty", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty });
    connector.spawn();

    expect(fakePty.spawn).toHaveBeenCalledTimes(1);
    expect(fakePty.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        name: "xterm-256color",
        cols: 80,
        rows: 24,
      }),
    );
  });

  it("uses custom shell path", () => {
    const connector = new NodePtyConnector({
      nodePty: fakePty,
      shell: "/bin/zsh",
    });
    connector.spawn();

    expect(fakePty.spawn).toHaveBeenCalledWith("/bin/zsh", expect.any(Array), expect.any(Object));
  });

  it("uses custom cols and rows", () => {
    const connector = new NodePtyConnector({
      nodePty: fakePty,
      cols: 120,
      rows: 40,
    });
    connector.spawn();

    expect(fakePty.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cols: 120, rows: 40 }),
    );
  });

  it("delivers shell output via onOutput", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty });
    const handler = vi.fn();

    connector.onOutput(handler);
    connector.spawn();

    fakePty._fireOutput("hello\r\n");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("hello\r\n");
  });

  it("delivers exit code via onExit", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty });
    const handler = vi.fn();

    connector.onExit(handler);
    connector.spawn();

    fakePty._fireExit(0);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(0);
  });

  it("supports multiple output listeners", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty });
    const h1 = vi.fn();
    const h2 = vi.fn();

    connector.onOutput(h1);
    connector.onOutput(h2);
    connector.spawn();

    fakePty._fireOutput("data");

    expect(h1).toHaveBeenCalledWith("data");
    expect(h2).toHaveBeenCalledWith("data");
  });

  it("write sends data to the PTY", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty });
    connector.spawn();

    const pty = fakePty._getPty();
    connector.write("ls -la\r");

    expect(pty.write).toHaveBeenCalledWith("ls -la\r");
  });

  it("write is no-op when not spawned", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty });
    expect(() => connector.write("test")).not.toThrow();
  });

  it("resize sends dimensions to the PTY", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty });
    connector.spawn();

    connector.resize(120, 40);
    const pty = fakePty._getPty();

    expect(pty.resize).toHaveBeenCalledWith(120, 40);
    expect(pty.cols).toBe(120);
    expect(pty.rows).toBe(40);
  });

  it("resize is no-op when not spawned", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty });
    expect(() => connector.resize(120, 40)).not.toThrow();
  });

  it("kill terminates the PTY and clears listeners", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty });
    const outputHandler = vi.fn();
    connector.onOutput(outputHandler);
    connector.spawn();

    connector.kill();

    // After kill, output listeners are cleared — firing should do nothing
    fakePty._fireOutput("should not fire");
    expect(outputHandler).not.toHaveBeenCalled();
  });

  it("kill handles PTY kill() throwing (already dead)", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty });
    connector.spawn();
    const pty = fakePty._getPty();
    // Replace kill with a throwing version
    pty.kill = vi.fn(() => {
      throw new Error("already dead");
    });
    expect(() => connector.kill()).not.toThrow();
  });

  it("spawn is idempotent — second call is no-op", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty });
    connector.spawn();
    connector.spawn();

    expect(fakePty.spawn).toHaveBeenCalledTimes(1);
  });

  it("onOutput unsubscribe stops receiving data", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty });
    const handler = vi.fn();

    const unsub = connector.onOutput(handler);
    connector.spawn();

    fakePty._fireOutput("first");
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();

    fakePty._fireOutput("second");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("onExit unsubscribe stops receiving exit events", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty });
    const handler = vi.fn();

    const unsub = connector.onExit(handler);
    connector.spawn();

    unsub();

    fakePty._fireExit(0);
    expect(handler).not.toHaveBeenCalled();
  });

  it("exposes cols and rows from options before spawn", () => {
    const connector = new NodePtyConnector({
      nodePty: fakePty,
      cols: 100,
      rows: 30,
    });
    expect(connector.cols).toBe(100);
    expect(connector.rows).toBe(30);
  });

  it("running returns false before spawn", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty });
    expect(connector.running).toBe(false);
  });

  it("running returns true after spawn", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty });
    connector.spawn();
    expect(connector.running).toBe(true);
  });

  it("running returns false after exit", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty });
    connector.spawn();

    fakePty._fireExit(0);

    expect(connector.running).toBe(false);
  });

  it("kill is safe when not spawned", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty });
    expect(() => connector.kill()).not.toThrow();
  });

  it("cols and rows return PTY values after spawn", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty, cols: 80, rows: 24 });
    connector.spawn();
    expect(connector.cols).toBe(80);
    expect(connector.rows).toBe(24);
  });

  it("cols and rows fall back to defaults when no PTY and no options", () => {
    const bare = new NodePtyConnector({ nodePty: fakePty });
    expect(bare.cols).toBe(80);
    expect(bare.rows).toBe(24);
  });

  it("spawn() uses default shell when SHELL is unset", () => {
    const origShell = process.env.SHELL;
    delete process.env.SHELL;
    try {
      const connector = new NodePtyConnector({ nodePty: fakePty });
      connector.spawn();
      expect(fakePty.spawn).toHaveBeenCalledWith(
        "/bin/bash",
        expect.any(Array),
        expect.any(Object),
      );
    } finally {
      process.env.SHELL = origShell;
    }
  });

  it("spawn() uses process.env.SHELL when available", () => {
    const origShell = process.env.SHELL;
    process.env.SHELL = "/bin/zsh";
    try {
      const connector = new NodePtyConnector({ nodePty: fakePty });
      connector.spawn();
      expect(fakePty.spawn).toHaveBeenCalledWith("/bin/zsh", expect.any(Array), expect.any(Object));
    } finally {
      process.env.SHELL = origShell;
    }
  });

  it("spreads process.env into PTY environment", () => {
    const connector = new NodePtyConnector({ nodePty: fakePty });
    connector.spawn();
    expect(fakePty.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ env: expect.objectContaining({ PATH: expect.any(String) }) }),
    );
  });

  // ── Fallback when process is not defined ─────────────────────────

  it("uses defaults when process is not defined (resolveProcessEnv fallback)", () => {
    const origProcess = globalThis.process;
    try {
      (globalThis as unknown as { process?: unknown }).process = undefined;
      const connector = new NodePtyConnector({ nodePty: fakePty });
      connector.spawn();
      // Should still work — env defaults to {} + TERM
      expect(fakePty.spawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({ TERM: "xterm-256color" }),
        }),
      );
    } finally {
      globalThis.process = origProcess;
    }
  });

  it("uses /bin/bash shell when process is undefined", () => {
    const origProcess = globalThis.process;
    try {
      (globalThis as unknown as { process?: unknown }).process = undefined;
      const connector = new NodePtyConnector({ nodePty: fakePty });
      connector.spawn();
      expect(fakePty.spawn).toHaveBeenCalledWith(
        "/bin/bash",
        expect.any(Array),
        expect.any(Object),
      );
    } finally {
      globalThis.process = origProcess;
    }
  });

  it("sets cwd to undefined when process is undefined", () => {
    const origProcess = globalThis.process;
    try {
      (globalThis as unknown as { process?: unknown }).process = undefined;
      const connector = new NodePtyConnector({ nodePty: fakePty });
      connector.spawn();
      const callArgs = fakePty.spawn.mock.calls[0];
      expect(callArgs[2].cwd).toBeUndefined();
    } finally {
      globalThis.process = origProcess;
    }
  });

  it("resolves cwd via process.cwd() when HOME is unset", () => {
    const origHome = process.env.HOME;
    delete process.env.HOME;
    try {
      const connector = new NodePtyConnector({ nodePty: fakePty });
      connector.spawn();
      const callArgs = fakePty.spawn.mock.calls[0];
      // Should use process.cwd() since HOME is undefined
      expect(callArgs[2].cwd).toBe(process.cwd());
    } finally {
      process.env.HOME = origHome;
    }
  });
});
