/**
 * Unit tests for isDebugSeed() — the launch debug-session seed.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isDebugSeed } from "@openp41ge/renderer/services/log-debug";

describe("isDebugSeed", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("is false when nothing seeds a debug session", () => {
    expect(isDebugSeed()).toBe(false);
  });

  it("is true when localStorage['openp41ge-debug'] is '1'", () => {
    localStorage.setItem("openp41ge-debug", "1");
    expect(isDebugSeed()).toBe(true);
  });

  it("is false when the localStorage override is '0'", () => {
    localStorage.setItem("openp41ge-debug", "0");
    expect(isDebugSeed()).toBe(false);
  });
});
