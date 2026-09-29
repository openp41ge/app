// App entry point
import * as Sentry from "@sentry/electron/renderer";
import { renderer } from "./app";

// Initialize Sentry in the renderer as early as possible. The DSN and
// environment are forwarded from the main process (which owns the real DSN),
// so no dsn is passed here. `@sentry/electron` routes renderer events to the
// main process for delivery (via IPC / the sentry-ipc protocol), and when the
// main has no DSN configured it stays disabled and this is a safe no-op.
Sentry.init();

renderer.start();
