/**
 * Openp41ge main process entry point.
 *
 * All startup logic has moved into Openp41geApplication (openp41ge-application.ts).
 * This file exists only to instantiate and start the application.
 */

import { Openp41geApplication } from "./openp41ge-application.js";
import { initSentry } from "./sentry.js";

// Initialize Sentry before the app starts (and thus before Electron is
// ready): the SDK must register its `sentry-ipc` scheme & IPC handlers early.
initSentry();

const app = new Openp41geApplication();
// Expose for the test framework to query lifecycle readiness via
// electronApplication.evaluate(() => openp41geApp.lifecycle.ready).
(globalThis as any).openp41geApp = app;
app.start();
