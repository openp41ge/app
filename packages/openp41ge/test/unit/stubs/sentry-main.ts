/**
 * No-op Sentry stub used only by vitest. Unit tests import `src/main/services/*`
 * which (transitively) reach `@sentry/electron/main`; that module imports
 * `electron`, which jsdom/node test environments can't load as ESM. This stub
 * exports the surface the capture helper touches; `isInitialized() === false`
 * makes every helper short-circuit so no Sentry calls happen in tests.
 */

export const isInitialized = (): boolean => false;
export const getClient = (): null => null;
export const withScope = (): void => {};
export const captureException = (): void => {};
export const captureMessage = (): void => {};
export const addBreadcrumb = (): void => {};
export const setTag = (): void => {};
