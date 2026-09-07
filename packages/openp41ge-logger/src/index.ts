/**
 * openp41ge-logger — structured logging for Openp41ge.
 *
 * Provides:
 *   - ILogger interface + createLogger() factory
 *   - Global log / event bus (in-memory buffer, query, subscribe, capture levels)
 *   - Persistent on-disk logging is wired by the platform: the renderer forwards
 *     entries over IPC and the main process writes them to ~/.openp41ge/logs/
 *
 * The <openp41ge-log-viewer> Web Component is exported from "openp41ge-logger/viewer".
 */

export {
  LogLevel,
  LOG_LEVEL_LABELS,
  type LogEntry,
  type StoredLogEntry,
  type LogProcess,
  type LogQuery,
  pushLog,
  getLogBuffer,
  queryLog,
  clearLogBuffer,
  subscribeLogs,
  setMinLevel,
  getMinLevel,
} from "./log-buffer";
export { createLogger, createNoopLogger, type ILogger } from "./logger";
export {
  registerLogStream,
  unregisterLogStream,
  listLogStreams,
  subscribeLogStreams,
  type LogStreamInfo,
  _resetLogStreams,
} from "./log-streams";
export {
  MemLogPageReader,
  LOG_PAGE_DEFAULT_LIMIT,
  type LogViewEntry,
  type LogPageResult,
  type LogPageReader,
} from "./log-page-reader";
