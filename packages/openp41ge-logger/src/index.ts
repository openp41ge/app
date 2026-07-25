/**
 * openp41ge-logger — structured logging for Openp41ge.
 *
 * Provides:
 *   - ILogger interface + createLogger() factory
 *   - Global log buffer (shared across all loggers)
 *
 * The <openp41ge-log-viewer> Web Component is exported from "openp41ge-logger/viewer".
 */

export {
  LogLevel,
  LOG_LEVEL_LABELS,
  type LogEntry,
  pushLog,
  getLogBuffer,
  clearLogBuffer,
  subscribeLogs,
} from "./log-buffer";
export { createLogger, createNoopLogger, type ILogger } from "./logger";
