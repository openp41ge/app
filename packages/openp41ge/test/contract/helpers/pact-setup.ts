/**
 * Shared Pact configuration for all contract tests.
 *
 * Provides helper functions to create PactV3 providers and Verifiers
 * with consistent settings across all consumer/provider tests.
 */

import path from "path";

/** Directory where generated Pact JSON files are written. */
export const PACTS_DIR = path.resolve(__dirname, "../pacts");

/** Default Pact log level. */
export const PACT_LOG_LEVEL = "warn" as const;

/**
 * Create consumer-side PactV3 options for a given consumer/provider pair.
 */
export function pactOptions(consumer: string, provider: string) {
  return {
    consumer,
    provider,
    dir: PACTS_DIR,
    logLevel: PACT_LOG_LEVEL,
  };
}

/**
 * Create provider-side Verifier options for a given provider/pact combination.
 */
export function verifierOptions(
  provider: string,
  providerBaseUrl: string,
  pactFileName: string,
  stateSetupUrl?: string,
) {
  return {
    provider,
    providerBaseUrl,
    pactUrls: [path.resolve(PACTS_DIR, pactFileName)],
    stateHandlers: stateSetupUrl ? { setupUrl: stateSetupUrl } : undefined,
    logLevel: PACT_LOG_LEVEL,
  };
}
