2025-07-29

# Fix Syntax Highlighting in File Editor

## Goal
Fix syntax highlighting (TextMate tokenization) in the `<file-editor>` component.

## Root Causes

### 1. `vscode-oniguruma` version mismatch
**File**: `packages/openp41ge-syntax-highlighting/package.json`
**Problem**: Depended on `vscode-oniguruma@^1.7.0`. The bundled `onig.wasm` was compiled with emscripten/embind (v3+) which requires the `_embind_register_constant` import. This import function is only provided by `vscode-oniguruma@^2.0.0+`. With v1.7.0, `loadWASM` instantiated the WASM without embind stubs, causing:
```
WebAssembly.instantiate(): Import #3 "env" "_embind_register_constant": function import requires a callable
```
**Fix**: Updated to `vscode-oniguruma@^2.0.0`.

### 2. Demo vite.config.ts missing source aliases
**File**: `demos/openp41ge-file-editor-demo/vite.config.ts`
**Problem**: Only aliased `openp41ge-uikit` to source. Deep imports from `openp41ge-editor-engine`, `openp41ge-syntax-highlighting`, `openp41ge-tabs`, `openp41ge-piece-tree`, and `openp41ge-git` were resolved through `package.json` exports pointing to `dist/`, which can be stale.
**Fix**: Added source aliases for all workspace dependencies.

### 3. Demo's `window.openp41ge.file` mock assignment
**File**: `demos/openp41ge-file-editor-demo/src/demo-app.ts`
**Problem**: The `??=` + property assignment failed in Vite's transformed output, preventing the demo module from loading.
**Fix**: Wrapped in try/catch with proper delete-then-reassign pattern.

## Verification
- Demo page loads with 2 editors showing TypeScript sample
- TokenRegistry is set on both editors
- Tokens include proper scope names (`s-cmt`, `s-kw`, `s-str`, `s-type`, `s-var`, `s-fun`, `s-op`, `s-pun`, `s-num`, `s-scl`, etc.)
- Theme colors applied correctly via `generateThemeCSS()`
- All captured errors = 0

## Completion Criteria
- [x] `nx quality` passes
- [x] `nx build` succeeds
- [x] `nx test` passes
- [x] Syntax highlighting visible in the demo with coloured keywords, strings, comments
- [x] Files changed: `package.json`, `vite.config.ts`, `demo-app.ts`
