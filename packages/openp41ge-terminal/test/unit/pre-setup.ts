/**
 * Pre-setup — loaded before all other setup files.
 *
 * Registers stderr interception and process warning handlers before
 * pact/http-proxy modules are imported, ensuring DEP0060 (util._extend)
 * and pact Rust-level warnings are suppressed on first fire.
 */

// ── Suppress DEP0060 on stderr ─────────────────────────────────────────
//
// Node.js v24+ internal deprecation codes (like DEP0060 from http-proxy's
// use of util._extend) bypass process.on("warning") listeners and write
// directly to stderr. We intercept stderr writes to filter known noise.

const _origStderrWrite = process.stderr.write.bind(process.stderr);
(process.stderr as any).write = function (data: string | Uint8Array, ...args: any[]): boolean {
  const str = typeof data === "string" ? data : String(data);
  if (
    str.includes("DEP0060") ||
    str.includes("pact_models::pact") ||
    str.includes("pact_matching::metrics")
  ) {
    return true; // suppress
  }
  return _origStderrWrite(data, ...(args as [any]));
};
