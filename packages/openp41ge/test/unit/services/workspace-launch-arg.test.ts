/**
 * Unit tests for parseWorkspaceLaunchArg — the startup seam that lets a
 * future CLI open the app with a workspace provided as a launch argument.
 */
import { describe, it, expect } from "vitest";
import { parseWorkspaceLaunchArg } from "../../../src/main/services/workspace-launch-arg";

describe("parseWorkspaceLaunchArg", () => {
  it("returns null when no --workspace flag is present", () => {
    expect(parseWorkspaceLaunchArg(["/electron", "/app.js"])).toBeNull();
    expect(parseWorkspaceLaunchArg([])).toBeNull();
  });

  it("returns the workspace path when --workspace <path> is provided", () => {
    expect(
      parseWorkspaceLaunchArg([
        "/electron",
        "/app.js",
        "--workspace",
        "/tmp/ws.openp41ge-workspace",
      ]),
    ).toBe("/tmp/ws.openp41ge-workspace");
  });

  it("returns null when --workspace is the last arg (no value)", () => {
    expect(parseWorkspaceLaunchArg(["/electron", "/app.js", "--workspace"])).toBeNull();
  });

  it("returns null when the value looks like another flag", () => {
    expect(parseWorkspaceLaunchArg(["/electron", "/app.js", "--workspace", "--dev"])).toBeNull();
  });

  it("returns the raw value when it contains spaces", () => {
    expect(
      parseWorkspaceLaunchArg([
        "/electron",
        "/app.js",
        "--workspace",
        "/tmp/my workspace.openp41ge-workspace",
      ]),
    ).toBe("/tmp/my workspace.openp41ge-workspace");
  });

  it("uses the first occurrence when repeated", () => {
    expect(
      parseWorkspaceLaunchArg([
        "/electron",
        "/app.js",
        "--workspace",
        "/tmp/first.openp41ge-workspace",
        "--workspace",
        "/tmp/second.openp41ge-workspace",
      ]),
    ).toBe("/tmp/first.openp41ge-workspace");
  });
});
