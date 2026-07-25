import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock xterm.js (browser-only canvas APIs not available in jsdom)
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    static strings: any = {};
    element: any = undefined;
    textarea: any = undefined;
    rows = 25;
    cols = 80;
    options: any = {};
    onBell = () => {};
    onBinary = () => {};
    onCursorMove = () => {};
    onKey = () => {};
    onLineFeed = () => {};
    onRender = () => {};
    onWriteParsed = () => {};
    onScroll = () => {};
    onSelectionChange = () => {};

    constructor(options?: any) {
      this.options = { ...options };
      const dataCbs: Array<(...args: any[]) => void> = [];
      this.onData = (cb: (...args: any[]) => void) => {
        dataCbs.push(cb);
        return () => {
          const i = dataCbs.indexOf(cb);
          if (i >= 0) dataCbs.splice(i, 1);
        };
      };
      (this as any)._fireData = (d: string) => dataCbs.forEach((cb) => cb(d));

      const resizeCbs: Array<(e: { cols: number; rows: number }) => void> = [];
      this.onResize = (cb: (e: { cols: number; rows: number }) => void) => {
        resizeCbs.push(cb);
        return () => {
          const i = resizeCbs.indexOf(cb);
          if (i >= 0) resizeCbs.splice(i, 1);
        };
      };
      (this as any)._fireResize = (cols: number, rows: number) =>
        resizeCbs.forEach((cb) => cb({ cols, rows }));

      const titleCbs: Array<(t: string) => void> = [];
      this.onTitleChange = (cb: (t: string) => void) => {
        titleCbs.push(cb);
        return () => {
          const i = titleCbs.indexOf(cb);
          if (i >= 0) titleCbs.splice(i, 1);
        };
      };
      (this as any)._fireTitleChange = (t: string) => titleCbs.forEach((cb) => cb(t));
    }

    open(_parent: any) {}
    write(_data: any) {}
    writeln(_data: any) {}
    clear() {}
    focus() {}
    blur() {}
    resize(columns: number, rows: number) {
      this.cols = columns;
      this.rows = rows;
    }
    dispose() {}
    loadAddon(addon: any) {
      if (typeof addon.activate === "function") addon.activate(this);
    }
    input(_data: any, _wasUserInput?: boolean) {}
    hasSelection() {
      return false;
    }
    getSelection() {
      return "";
    }
    clearSelection() {}
    selectAll() {}
    select(_col: number, _row: number, _length: number) {}
    selectLines(_start: number, _end: number) {}
    scrollLines(_amount: number) {}
    scrollPages(_pageCount: number) {}
    scrollToTop() {}
    scrollToBottom() {}
    scrollToLine(_line: number) {}
    attachCustomKeyEventHandler(_handler: any) {}
    registerLinkProvider(_provider: any) {
      return { dispose: () => {} };
    }
    registerMarker(_cursorYOffset?: number) {
      return undefined;
    }
    registerDecoration(_options: any) {
      return undefined;
    }
    registerCharacterJoiner(_handler: any) {
      return 0;
    }
    deregisterCharacterJoiner(_joinerId: number) {}
    getSelectionPosition() {
      return undefined;
    }
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    activate(terminal: any): void {
      (this as any)._terminal = terminal;
    }
    dispose(): void {
      (this as any)._terminal = null;
    }
    fit(): void {}
    proposeDimensions(): { cols: number; rows: number } | undefined {
      return { cols: 80, rows: 25 };
    }
  },
}));

import "@openp41ge-terminal/ui/openp41ge-terminal";
import type { ShellConnector } from "@openp41ge-terminal/shell/shell-connector";
import type { Openp41geTerminal } from "@openp41ge-terminal/ui/openp41ge-terminal";

/** Create a mock ShellConnector for testing. */
function createMockConnector(): ShellConnector & {
  _fireOutput: (data: string) => void;
  _fireExit: (code: number | null) => void;
} {
  const outputListeners = new Set<(data: string) => void>();
  const exitListeners = new Set<(code: number | null) => void>();

  return {
    spawn: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onOutput: vi.fn((cb: (data: string) => void) => {
      outputListeners.add(cb);
      return () => outputListeners.delete(cb);
    }),
    onExit: vi.fn((cb: (code: number | null) => void) => {
      exitListeners.add(cb);
      return () => exitListeners.delete(cb);
    }),
    _fireOutput(data: string) {
      outputListeners.forEach((cb) => cb(data));
    },
    _fireExit(code: number | null) {
      exitListeners.forEach((cb) => cb(code));
    },
  };
}

describe("Openp41geTerminal (custom element)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("can be created via document.createElement", () => {
    const el = document.createElement("openp41ge-terminal");
    expect(el).toBeTruthy();
  });

  it("renders DOM structure when connected", () => {
    const el = document.createElement("openp41ge-terminal");
    document.body.appendChild(el);

    expect(el.shadowRoot).toBeTruthy();
    // Should have a terminal container
    expect(el.shadowRoot!.querySelector(".st-term-container")).toBeTruthy();
  });

  it("shows a header bar by default", () => {
    const el = document.createElement("openp41ge-terminal");
    document.body.appendChild(el);

    expect(el.shadowRoot!.querySelector(".st-header")).toBeTruthy();
    expect(el.shadowRoot!.querySelector(".st-header-label")?.textContent).toBe("Terminal");
    expect(el.shadowRoot!.querySelector(".st-close-btn")).toBeTruthy();
  });

  it("hides the header when showHeader is false", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    el.setOptions({ showHeader: false });
    document.body.appendChild(el);

    expect(el.shadowRoot!.querySelector(".st-header")).toBeNull();
    expect(el.shadowRoot!.querySelector(".st-term-container")).toBeTruthy();
  });

  it("uses a custom header label", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    el.setOptions({ headerLabel: "Shell" });
    document.body.appendChild(el);

    expect(el.shadowRoot!.querySelector(".st-header-label")?.textContent).toBe("Shell");
  });

  it("initializes an xterm Terminal instance", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    document.body.appendChild(el);

    expect(el.terminal).toBeTruthy();
    expect(el.cols).toBeGreaterThan(0);
    expect(el.rows).toBeGreaterThan(0);
  });

  it("exposes cols and rows properties", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    document.body.appendChild(el);

    expect(typeof el.cols).toBe("number");
    expect(typeof el.rows).toBe("number");
  });

  it("write sends data to the terminal", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    document.body.appendChild(el);

    expect(() => el.write("Hello")).not.toThrow();
    expect(() => el.write(new Uint8Array([0x48, 0x69]))).not.toThrow();
  });

  it("writeln sends data to the terminal", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    document.body.appendChild(el);

    expect(() => el.writeln("Hello")).not.toThrow();
  });

  it("clear clears the terminal", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    document.body.appendChild(el);

    expect(() => el.clear()).not.toThrow();
  });

  it("focus and blur do not throw", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    document.body.appendChild(el);

    expect(() => el.focus()).not.toThrow();
    expect(() => el.blur()).not.toThrow();
  });

  it("resize changes cols and rows", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    document.body.appendChild(el);

    el.resize(120, 40);
    expect(el.cols).toBe(120);
    expect(el.rows).toBe(40);
  });

  it("fit does not throw", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    document.body.appendChild(el);

    expect(() => el.fit()).not.toThrow();
  });

  it("registers a data handler via onData", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    document.body.appendChild(el);

    const handler = vi.fn();
    el.onData(handler);

    const term = el.terminal;
    term._fireData("hello");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("hello");
  });

  it("dispatches terminal-resize event on terminal resize", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    document.body.appendChild(el);

    const handler = vi.fn();
    el.addEventListener("terminal-resize", handler);

    const term = el.terminal;
    term._fireResize(100, 30);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { cols: 100, rows: 30 },
      }),
    );
  });

  it("dispatches terminal-title event on title change", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    document.body.appendChild(el);

    const handler = vi.fn();
    el.addEventListener("terminal-title", handler);

    const term = el.terminal;
    term._fireTitleChange("bash");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { title: "bash" },
      }),
    );
  });

  it.skip("updates header label on title change", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    document.body.appendChild(el);

    const term = el.terminal;
    term._fireTitleChange("zsh");

    const label = el.shadowRoot!.querySelector(".st-header-label");
    expect(label?.textContent).toBe("zsh");
  });

  it("dispatches terminal-close event on close button click", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    document.body.appendChild(el);

    const handler = vi.fn();
    el.addEventListener("terminal-close", handler);

    const closeBtn = el.shadowRoot!.querySelector(".st-close-btn") as HTMLElement;
    closeBtn.click();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not re-build on re-connect", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    document.body.appendChild(el);

    const firstChildren = el.shadowRoot!.children.length;

    // Simulate re-connect
    el.connectedCallback();

    expect(el.shadowRoot!.children.length).toBe(firstChildren);
  });

  it("disconnectedCallback disposes the terminal", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    document.body.appendChild(el);

    const disposeSpy = vi.spyOn(el.terminal!, "dispose");

    el.remove();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it("merges user options with defaults", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    el.setOptions({
      terminal: { fontSize: 18, cursorBlink: false },
    });
    document.body.appendChild(el);

    const term = el.terminal;
    expect(term.options.fontSize).toBe(18);
    expect(term.options.cursorBlink).toBe(false);
    expect(term.options.scrollback).toBe(5000);
  });

  // ── Theme API (Phase 6) ─────────────────────────────────────────

  describe("setTheme", () => {
    it("applies a partial ITheme object", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      document.body.appendChild(el);

      el.setTheme({ background: "#ff0000", foreground: "#00ff00" });

      expect(el.terminal.options.theme.background).toBe("#ff0000");
      expect(el.terminal.options.theme.foreground).toBe("#00ff00");
    });

    it("applies a built-in theme by name", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      document.body.appendChild(el);

      el.setTheme("light");

      expect(el.terminal.options.theme.background).toBe("#ffffff");
      expect(el.terminal.options.theme.foreground).toBe("#333333");
    });

    it("applies the dracula theme by name", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      document.body.appendChild(el);

      el.setTheme("dracula");

      expect(el.terminal.options.theme.background).toBe("#282a36");
      expect(el.terminal.options.theme.foreground).toBe("#f8f8f2");
    });

    it("applies the github-dark theme by name", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      document.body.appendChild(el);

      el.setTheme("github-dark");

      expect(el.terminal.options.theme.background).toBe("#0d1117");
    });

    it.skip("warns and does nothing for unknown theme names", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      document.body.appendChild(el);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      el.setTheme("nonexistent" as unknown as string);

      // The logger adds a prefix argument before the message
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[openp41ge-terminal]"),
        expect.stringContaining('unknown built-in theme "nonexistent"'),
      );

      // Theme should still be the default (dark)
      expect(el.terminal.options.theme.background).toBe("#1e1e1e");

      warnSpy.mockRestore();
    });

    it("is a no-op when terminal is not initialized", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      // Don't append to DOM — terminal is null
      expect(() => el.setTheme("dark")).not.toThrow();
    });
  });

  // ── Shell restart & auto-restart (Phase 7) ──────────────────────

  describe("restart behavior", () => {
    it("autoRestart option re-spawns shell without showing banner", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      el.setOptions({ autoRestart: true });
      const connector = createMockConnector();
      el.setConnector(connector);
      document.body.appendChild(el);

      connector._fireExit(0);

      // Should have spawned again automatically
      expect(connector.spawn).toHaveBeenCalledTimes(2);

      // Banner should NOT be visible
      const banner = el.shadowRoot!.getElementById("exit-banner");
      expect(banner?.classList.contains("visible")).toBe(false);
    });

    it("autoRestart still dispatches terminal-exit event", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      el.setOptions({ autoRestart: true });
      const connector = createMockConnector();
      el.setConnector(connector);
      document.body.appendChild(el);

      const handler = vi.fn();
      el.addEventListener("terminal-exit", handler);

      connector._fireExit(1);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ detail: { code: 1 } }));
    });

    it.skip("clearOnRestart clears the terminal buffer on restart", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      el.setOptions({ clearOnRestart: true });
      const connector = createMockConnector();
      el.setConnector(connector);
      document.body.appendChild(el);

      const clearSpy = vi.spyOn(el.terminal!, "clear");

      connector._fireExit(0);
      const restartBtn = el.shadowRoot!.getElementById("restart-btn") as HTMLElement;
      restartBtn.click();

      expect(clearSpy).toHaveBeenCalledTimes(1);
    });

    it.skip("manual restart from button does NOT clear when clearOnRestart is false", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      // clearOnRestart defaults to false
      const connector = createMockConnector();
      el.setConnector(connector);
      document.body.appendChild(el);

      const clearSpy = vi.spyOn(el.terminal!, "clear");

      connector._fireExit(0);
      const restartBtn = el.shadowRoot!.getElementById("restart-btn") as HTMLElement;
      restartBtn.click();

      expect(clearSpy).not.toHaveBeenCalled();
    });

    it("autoRestart with clearOnRestart clears on automatic restart", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      el.setOptions({ autoRestart: true, clearOnRestart: true });
      const connector = createMockConnector();
      el.setConnector(connector);
      document.body.appendChild(el);

      const clearSpy = vi.spyOn(el.terminal!, "clear");

      connector._fireExit(0);

      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(connector.spawn).toHaveBeenCalledTimes(2);
    });
  });

  // ── Shell connector tests ────────────────────────────────────────

  describe("with ShellConnector", () => {
    it("setConnector stores the connector", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      const connector = createMockConnector();
      el.setConnector(connector);

      expect(el.connector).toBe(connector);
    });

    it("spawns the shell on connect when a connector is set", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      const connector = createMockConnector();
      el.setConnector(connector);
      document.body.appendChild(el);

      expect(connector.spawn).toHaveBeenCalledTimes(1);
    });

    it("pipes shell output to xterm display", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      const connector = createMockConnector();
      el.setConnector(connector);
      document.body.appendChild(el);

      const writeSpy = vi.spyOn(el.terminal!, "write");

      connector._fireOutput("Hello from shell\r\n");

      expect(writeSpy).toHaveBeenCalledWith("Hello from shell\r\n");
    });

    it("pipes user input to shell stdin", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      const connector = createMockConnector();
      el.setConnector(connector);
      document.body.appendChild(el);

      const term = el.terminal;
      term._fireData("ls -la\r");

      expect(connector.write).toHaveBeenCalledWith("ls -la\r");
    });

    it("forwards terminal resize to connector", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      const connector = createMockConnector();
      el.setConnector(connector);
      document.body.appendChild(el);

      const term = el.terminal;
      term._fireResize(100, 30);

      expect(connector.resize).toHaveBeenCalledWith(100, 30);
    });

    it("kills the connector on disconnect", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      const connector = createMockConnector();
      el.setConnector(connector);
      document.body.appendChild(el);

      el.remove();

      expect(connector.kill).toHaveBeenCalledTimes(1);
    });

    it.skip("shows exit banner when shell exits", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      const connector = createMockConnector();
      el.setConnector(connector);
      document.body.appendChild(el);

      connector._fireExit(0);

      const banner = el.shadowRoot!.getElementById("exit-banner");
      expect(banner?.classList.contains("visible")).toBe(true);

      const msg = el.shadowRoot!.getElementById("exit-message");
      expect(msg?.textContent).toContain("code 0");
    });

    it.skip("shows process exited without code message when null", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      const connector = createMockConnector();
      el.setConnector(connector);
      document.body.appendChild(el);

      connector._fireExit(null);

      const msg = el.shadowRoot!.getElementById("exit-message");
      expect(msg?.textContent).toBe("Process exited.");
    });

    it("dispatches terminal-exit event on shell exit", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      const connector = createMockConnector();
      el.setConnector(connector);
      document.body.appendChild(el);

      const handler = vi.fn();
      el.addEventListener("terminal-exit", handler);

      connector._fireExit(0);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { code: 0 },
        }),
      );
    });

    it("does not send user input to shell after exit", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      const connector = createMockConnector();
      el.setConnector(connector);
      document.body.appendChild(el);

      connector._fireExit(1);

      const term = el.terminal;
      term._fireData("still typing");

      // Should NOT be forwarded to connector.write
      expect(connector.write).not.toHaveBeenCalledWith("still typing");
    });

    it.skip("restart button re-spawns the shell", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      const connector = createMockConnector();
      el.setConnector(connector);
      document.body.appendChild(el);

      connector._fireExit(0);

      const restartBtn = el.shadowRoot!.getElementById("restart-btn") as HTMLElement;
      restartBtn.click();

      expect(connector.spawn).toHaveBeenCalledTimes(2);

      // Banner should be hidden after restart
      const banner = el.shadowRoot!.getElementById("exit-banner");
      expect(banner?.classList.contains("visible")).toBe(false);
    });

    it.skip("restart re-enables input forwarding", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      const connector = createMockConnector();
      el.setConnector(connector);
      document.body.appendChild(el);

      connector._fireExit(0);

      const restartBtn = el.shadowRoot!.getElementById("restart-btn") as HTMLElement;
      restartBtn.click();

      const term = el.terminal;
      term._fireData("echo hello\r");

      expect(connector.write).toHaveBeenCalledWith("echo hello\r");
    });
  });

  // ── Auto-detect IPC bridge (Phase 4) ────────────────────────────

  describe("auto-detect window.openp41ge.terminal", () => {
    beforeEach(() => {
      // Set up a mock window.openp41ge.terminal
      const _global = globalThis as unknown as { window: Record<string, unknown> };
      _global.window = {
        openp41ge: {
          terminal: {
            spawn: vi.fn(),
            write: vi.fn(),
            resize: vi.fn(),
            kill: vi.fn(),
            onData: vi.fn(() => vi.fn()),
            onExit: vi.fn(() => vi.fn()),
          },
        },
      };
    });

    afterEach(() => {
      const _global = globalThis as unknown as { window: Record<string, unknown> };
      delete _global.window;
    });

    it("auto-creates IpcShellConnector when bridge is available", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      document.body.appendChild(el);

      expect(el.connector).toBeTruthy();
      expect(window.openp41ge.terminal.spawn).toHaveBeenCalled();
    });

    it("reads pane-id attribute for IpcShellConnector", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      el.setAttribute("pane-id", "my-custom-pane");
      document.body.appendChild(el);

      expect(window.openp41ge.terminal.spawn).toHaveBeenCalledWith("my-custom-pane");
    });

    it("does not auto-connect when window.openp41ge.terminal is missing", () => {
      const _global = globalThis as unknown as { window: Record<string, unknown> };
      delete (_global.window as Record<string, unknown>).openp41ge;
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      document.body.appendChild(el);

      expect(el.connector).toBeNull();
    });

    it("explicit setConnector takes precedence over auto-detect", () => {
      const customConnector = createMockConnector();
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      el.setConnector(customConnector);
      document.body.appendChild(el);

      // window.openp41ge.terminal.spawn should NOT be called
      expect(window.openp41ge.terminal.spawn).not.toHaveBeenCalled();

      // Custom connector should be used
      expect(customConnector.spawn).toHaveBeenCalled();
    });
  });

  // ── observedAttributes (coverage edge) ──────────────────────────

  describe("observedAttributes", () => {
    it("returns pane-id", () => {
      const el = document.createElement("openp41ge-terminal");
      const attrs = (el.constructor as typeof HTMLElement).observedAttributes;
      expect(attrs).toEqual(["pane-id"]);
    });
  });

  // ── _fit() catch block coverage ─────────────────────────────────

  describe("_fit() catch coverage", () => {
    it("handles fitAddon.fit() throwing", () => {
      const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
      document.body.appendChild(el);

      // Make fitAddon.fit() throw to trigger the catch block
      const fitAddon = el._fitAddon;
      const origFit = fitAddon.fit.bind(fitAddon);
      fitAddon.fit = vi.fn(() => {
        throw new Error("layout not ready");
      });

      expect(() => el.fit()).not.toThrow();
      expect(fitAddon.fit).toHaveBeenCalled();

      // Restore
      fitAddon.fit = origFit;
    });
  });

  // ── cols/rows getter fallback and _initTerminal guard ───────────

  it("cols getter falls back to 0 before _terminal is initialized", () => {
    // Create element but DON'T append to DOM — _terminal is not initialized
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    // No connectedCallback runs, so _terminal is null
    expect(el.cols).toBe(0);
  });

  it("rows getter falls back to 0 before _terminal is initialized", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    expect(el.rows).toBe(0);
  });

  it.skip("_initTerminal guard returns early when _termContainer is null", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    // _termContainer is null before connectedCallback / _buildDOM
    // Calling the private method directly should not throw
    const termBefore = el._terminal;
    el._initTerminal();
    // Terminal should NOT have been initialized
    expect(el._terminal).toBe(termBefore);
    // Should still be null (not initialized)
    expect(el._terminal).toBeNull();
  });

  it("registerOpenp41geTerminal is idempotent when called again", async () => {
    // Element already registered by module import
    const { registerOpenp41geTerminal } = await import("@openp41ge-terminal/ui/openp41ge-terminal");
    expect(() => registerOpenp41geTerminal()).not.toThrow();
    expect(customElements.get("openp41ge-terminal")).toBeTruthy();
  });

  // ── Defensive branch coverage ─────────────────────────────────

  it("does not update header on title change when header is hidden", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    el.setOptions({ showHeader: false });
    document.body.appendChild(el);
    // HeaderEl is null, so onTitleChange's if (this._headerEl) takes the false branch
    const term = el.terminal;
    expect(() => term._fireTitleChange("bash")).not.toThrow();
    document.body.removeChild(el);
  });

  it("handles missing label element on title change", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    document.body.appendChild(el);
    // Remove the label element so querySelector returns null
    const label = el.shadowRoot!.querySelector(".st-header-label")!;
    label.remove();
    const term = el.terminal;
    expect(() => term._fireTitleChange("bash")).not.toThrow();
    document.body.removeChild(el);
  });

  it("_showExitMessage handles missing banner element", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    document.body.appendChild(el);
    const banner = el.shadowRoot!.getElementById("exit-banner")!;
    banner.remove();
    expect(() => (el as any)._showExitMessage(0)).not.toThrow();
    document.body.removeChild(el);
  });

  it("_showExitMessage handles missing message element", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    document.body.appendChild(el);
    const msg = el.shadowRoot!.getElementById("exit-message")!;
    msg.remove();
    expect(() => (el as any)._showExitMessage(0)).not.toThrow();
    document.body.removeChild(el);
  });

  it.skip("_hideExitMessage handles missing banner element", () => {
    const el = document.createElement("openp41ge-terminal") as unknown as Openp41geTerminal;
    document.body.appendChild(el);
    const banner = el.shadowRoot!.getElementById("exit-banner")!;
    banner.remove();
    expect(() => (el as any)._hideExitMessage()).not.toThrow();
    document.body.removeChild(el);
  });
});
