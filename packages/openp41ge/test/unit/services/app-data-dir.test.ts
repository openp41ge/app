/**
 * Tests for the app-data directory resolver.
 *
 * Verifies the dev/release folder naming and the env-override precedence used
 * to decide where openp41ge stores its user data.
 */

import { describe, expect, test, beforeEach, afterEach } from "vitest";
import os from "os";
import path from "path";
import {
  APP_DATA_DIR_PRODUCTION,
  APP_DATA_DIR_DEV,
  appDataDirName,
  resolveAppDataDir,
} from "../../../src/main/services/app-data-dir";

describe("appDataDirName", () => {
  test("packaged release uses the production folder", () => {
    expect(appDataDirName(true)).toBe(APP_DATA_DIR_PRODUCTION);
  });

  test("dev build uses the -dev folder", () => {
    expect(appDataDirName(false)).toBe(APP_DATA_DIR_DEV);
  });
});

describe("resolveAppDataDir", () => {
  const orig = process.env;

  beforeEach(() => {
    process.env = { ...orig };
    delete process.env.OPENP41GE_E2E_DIR;
    delete process.env.OPENP41GE_DIR;
  });

  afterEach(() => {
    process.env = orig;
  });

  test("defaults under home to production folder when packaged", () => {
    expect(resolveAppDataDir(true)).toBe(path.join(os.homedir(), APP_DATA_DIR_PRODUCTION));
  });

  test("defaults under home to -dev folder when not packaged", () => {
    expect(resolveAppDataDir(false)).toBe(path.join(os.homedir(), APP_DATA_DIR_DEV));
  });

  test("OPENP41GE_DIR overrides the default regardless of packaged state", () => {
    process.env.OPENP41GE_DIR = "/tmp/custom-openp41ge";
    expect(resolveAppDataDir(true)).toBe("/tmp/custom-openp41ge");
    expect(resolveAppDataDir(false)).toBe("/tmp/custom-openp41ge");
  });

  test("OPENP41GE_E2E_DIR wins over OPENP41GE_DIR", () => {
    process.env.OPENP41GE_DIR = "/tmp/custom-openp41ge";
    process.env.OPENP41GE_E2E_DIR = "/tmp/e2e-openp41ge";
    expect(resolveAppDataDir(false)).toBe("/tmp/e2e-openp41ge");
  });
});
