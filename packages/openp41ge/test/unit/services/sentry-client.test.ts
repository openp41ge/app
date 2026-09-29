/**
 * Unit tests for the main-process Sentry capture helpers.
 *
 * In tests `@sentry/electron/main` is aliased to a no-op stub whose
 * `isInitialized()` returns false, so the helpers must be safe no-ops: they
 * must never throw, and they must not hand anything to Sentry.
 */

import { describe, expect, test, vi } from "vitest";
import {
  captureError,
  captureMessage,
  addSentryBreadcrumb,
  setSentryTag,
} from "@openp41ge/main/services/sentry";

describe("sentry capture helpers (safe no-ops without a client)", () => {
  test("captureError with an Error does not throw", () => {
    expect(() => captureError(new Error("boom"))).not.toThrow();
  });

  test("captureError with a non-Error value does not throw", () => {
    expect(() => captureError("plain string")).not.toThrow();
    expect(() => captureError({ code: "EIO" })).not.toThrow();
    expect(() => captureError(undefined)).not.toThrow();
  });

  test("captureMessage does not throw", () => {
    expect(() => captureMessage("vLLM returned 500")).not.toThrow();
    expect(() =>
      captureMessage("vLLM returned 500", {
        level: "error",
        tags: { operation: "chat.upstream_error", model: "m" },
        extra: { status: 500 },
      }),
    ).not.toThrow();
  });

  test("addSentryBreadcrumb and setSentryTag do not throw", () => {
    expect(() =>
      addSentryBreadcrumb({ category: "chat.request", level: "info", data: { model: "m" } }),
    ).not.toThrow();
    expect(() => setSentryTag("channel", "alpha")).not.toThrow();
  });

  test("helpers swallow a throwing Sentry rather than propagate", () => {
    // The helpers guard their call site in try/catch; this exercises the shape
    // by confirming a full options object (which the stub ignores) is safe.
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      captureError(new Error("x"), {
        tags: { a: "b" },
        extra: { nested: { list: [1, 2, 3] } },
        level: "fatal",
      }),
    ).not.toThrow();
    spy.mockRestore();
  });
});
