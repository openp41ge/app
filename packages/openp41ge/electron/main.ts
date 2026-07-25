/**
 * Openp41ge main process entry point.
 *
 * All startup logic has moved into Openp41geApplication (openp41ge-application.ts).
 * This file exists only to instantiate and start the application.
 */

import { Openp41geApplication } from "./openp41ge-application.js";

const app = new Openp41geApplication();
// Expose for the test framework to query lifecycle readiness via
// electronApplication.evaluate(() => openp41geApp.lifecycle.ready).
(globalThis as any).openp41geApp = app;
app.start();
