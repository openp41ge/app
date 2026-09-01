// @vitest-environment jsdom
/**
 * Unit tests for ResolveWindowKindStep — reads this window's kind + workspace
 * binding from the preload bridge into the startup context.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ResolveWindowKindStep } from "../../../src/renderer/bootstrap/steps/resolve-window-kind.step";

// The step only reads/writes two fields; we use a plain object rather than
// importing StartupContext (which pulls a heavy, duplicate-registering graph).
type Ctx = { windowType: "workspace" | "window-manager"; workspacePath: string | null };

function makeCtx(): Ctx {
  return { windowType: "workspace", workspacePath: null };
}

function installBridge(windowType?: string, workspacePath: string | null = null): void {
  (window as unknown as { openp41ge: unknown }).openp41ge = {
    workspace: {
      getWindowType: () => windowType,
      getWorkspacePath: () => workspacePath,
    },
  } as unknown as typeof window.openp41ge;
}

function removeBridge(): void {
  delete (window as unknown as { openp41ge?: unknown }).openp41ge;
}

describe("ResolveWindowKindStep", () => {
  let context: Ctx;

  beforeEach(() => {
    context = makeCtx();
    removeBridge();
  });

  afterEach(() => {
    removeBridge();
  });

  it("defaults to workspace when the preload bridge is absent", () => {
    new ResolveWindowKindStep().run(context as never);
    expect(context.windowType).toBe("workspace");
    expect(context.workspacePath).toBeNull();
  });

  it("reads window-manager kind and workspace path", () => {
    installBridge("window-manager", "/tmp/acme.openp41ge-workspace");
    new ResolveWindowKindStep().run(context as never);
    expect(context.windowType).toBe("window-manager");
    expect(context.workspacePath).toBe("/tmp/acme.openp41ge-workspace");
  });

  it("reads workspace kind and a bound path", () => {
    installBridge("workspace", "/tmp/acme.openp41ge-workspace");
    new ResolveWindowKindStep().run(context as never);
    expect(context.windowType).toBe("workspace");
    expect(context.workspacePath).toBe("/tmp/acme.openp41ge-workspace");
  });

  it("defaults to workspace for an unknown kind", () => {
    installBridge("something-else", null);
    new ResolveWindowKindStep().run(context as never);
    expect(context.windowType).toBe("workspace");
  });

  it("defaults to workspace when getWindowType is unavailable", () => {
    (window as unknown as { openp41ge: unknown }).openp41ge = {
      workspace: {},
    } as unknown as typeof window.openp41ge;
    new ResolveWindowKindStep().run(context as never);
    expect(context.windowType).toBe("workspace");
    expect(context.workspacePath).toBeNull();
  });
});
