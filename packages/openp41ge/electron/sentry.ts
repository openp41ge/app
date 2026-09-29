/**
 * openp41ge-sentry — Sentry (error monitoring) for the Electron main process.
 *
 * The manager / workspace windows (renderers) forward their errors to the main
 * process over Sentry's Inter-Process-Communication (see `@sentry/electron`),
 * so this single main-process init is the one place with the real DSN. The
 * renderer SDK only needs a bare `Sentry.init()`; the DSN and environment are
 * propagated by `@sentry/electron` itself and sent with the main client.
 *
 * The DSN is read from the `OPENP41GE_SENTRY_DSN` environment variable so a
 * DSN can be supplied without a rebuild (useful in dev and for rolling out the
 * DSN once the Sentry project exists). When it is unset, Sentry is left
 * disabled entirely — no network calls, no event capture — so the app works
 * and stays quiet until a DSN is configured.
 *
 * IMPORTANT: `Sentry.init()` MUST run before Electron's `app` "ready" event —
 * the SDK registers the `sentry-ipc` privileged scheme and IPC/protocol
 * handlers during init, and the scheme registration is only allowed before
 * ready. That is why `initSentry()` is called from `electron/main.ts` at module
 * load, ahead of `Openp41geApplication.start()`.
 */

import { app } from "electron";
import * as Sentry from "@sentry/electron/main";
import { createLogger } from "openp41ge-logger";

const log = createLogger("openp41ge", "sentry");

/** The Sentry DSN for this app, or undefined to disable Sentry. */
function sentryDsn(): string | undefined {
  const dsnValue = process.env.OPENP41GE_SENTRY_DSN;
  return dsnValue && dsnValue.trim() !== "" ? dsnValue.trim() : undefined;
}

/**
 * Initialize Sentry in the main process. No-op when `OPENP41GE_SENTRY_DSN` is
 * not set. Call this as early as possible (before `app.whenReady()`).
 */
export function initSentry(): void {
  const dsnValue = sentryDsn();
  if (!dsnValue) {
    log.debug("Sentry disabled — OPENP41GE_SENTRY_DSN is not set.");
    return;
  }

  const environment = app.isPackaged ? "production" : "development";
  Sentry.init({
    dsn: dsnValue,
    release: app.getVersion(),
    environment,
    // Error monitoring for now; adjust once tracing is wanted.
    tracesSampleRate: 0,
  });
  log.debug(`Sentry initialized (environment=${environment}, release=${app.getVersion()}).`);
}
