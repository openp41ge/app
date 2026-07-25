2025-07-21

# Three-Layer Configuration System

## Goal

Replace the current single-layer `~/.openp41ge/user/config.json` with a three-layer
config system: **app defaults → user config → repo config**, each merging
over the previous. This allows per-project overrides (e.g., assigning specific
file extensions to specific syntax themes) while keeping user-level preferences.

## Background

Current config state:

| Layer        | Location                                                        | What it holds                                     |
| ------------ | --------------------------------------------------------------- | ------------------------------------------------- |
| App defaults | Hardcoded `DEFAULT_CONFIG` in `main/services/config-service.ts` | Editor font, theme, syntax theme defaults         |
| User config  | `~/.openp41ge/user/config.json`                                 | User overrides for editor settings, syntax themes |
| Repo config  | ❌ Does not exist                                               | —                                                 |

The `syntaxThemes` map in the config lets users assign a syntax theme ID to a
file extension (e.g., `".md": "github-dark"`). With repo config, a project can
override mappings for its own files, e.g., forcing `.tf` files to use a specific
theme or assigning custom grammar extensions.

## New Structure

### Config Schema (`schemas/config.schema.json`)

A single JSON Schema file at the repo root that defines the canonical shape
of all config layers:

```
openp41ge/
├── schemas/
│   └── config.schema.json    # JSON Schema (draft-07)
├── config.json               # App defaults (checked into VCS, bundled)
├── packages/
│   └── openp41ge/...
```

The schema defines:

```jsonc
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://openp41ge.sh/schemas/config.schema.json",
  "title": "Openp41ge Config",
  "type": "object",
  "properties": {
    "version": { "type": "integer", "minimum": 1 },
    "appTheme": { "type": "string", "enum": ["dark", "light"] },
    "editor": {
      "type": "object",
      "properties": {
        "lineHeight": { "type": "integer", "minimum": 10, "maximum": 100, "default": 20 },
        "fontSize": { "type": "integer", "minimum": 8, "maximum": 72, "default": 14 },
        "fontFamily": {
          "type": "string",
          "default": "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
        },
      },
    },
    "syntaxThemes": {
      "type": "object",
      "description": "Map of file extension to syntax theme ID",
      "additionalProperties": { "type": "string" },
      "default": {},
    },
    "syntaxExtensions": {
      "type": "object",
      "description": "Map of file extension to grammar language ID, overriding built-in extension→language mapping",
      "additionalProperties": { "type": "string" },
      "default": {},
    },
  },
  "required": ["version"],
}
```

The new `syntaxExtensions` map is key to the repo config use case — it lets
a project assign a grammar to a non-standard extension. For example:

```jsonc
// .openp41ge/config.json (repo config)
{
  "syntaxExtensions": {
    "hcl": "terraform", // treat .hcl files with Terraform grammar instead of HCL
    "tmpl": "html", // treat .tmpl files as HTML
  },
}
```

### App Defaults (`config.json`)

A checked-in `config.json` at the repo root:

```json
{
  "version": 1,
  "appTheme": "dark",
  "editor": {
    "lineHeight": 20,
    "fontSize": 14,
    "fontFamily": "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace"
  },
  "syntaxThemes": {
    ".ts": "openp41ge-dark",
    ".tsx": "openp41ge-dark",
    ".js": "openp41ge-dark",
    ".jsx": "openp41ge-dark",
    ".json": "openp41ge-dark",
    ".md": "github-dark",
    ".css": "openp41ge-dark",
    ".html": "openp41ge-dark",
    ".yaml": "openp41ge-dark",
    ".sh": "openp41ge-dark"
  },
  "syntaxExtensions": {}
}
```

This is loaded as the base layer. Replaces the hardcoded `DEFAULT_CONFIG`
object in `main/services/config-service.ts`.

### User Config (`~/.openp41ge/user/config.json`)

Unchanged location but now layered on top of app defaults:

```jsonc
// ~/.openp41ge/user/config.json
{
  "version": 1,
  "editor": {
    "fontSize": 16, // overrides app default of 14
  },
  "syntaxThemes": {
    ".ts": "monokai", // overrides app default of "openp41ge-dark"
  },
}
```

### Repo Config (`.openp41ge/config.json`)

A per-project config, NOT checked into VCS (add to `.gitignore`):

```jsonc
// <project-root>/.openp41ge/config.json
{
  "version": 1,
  "syntaxThemes": {
    ".tf": "github-dark",
  },
  "syntaxExtensions": {
    "tfvars": "terraform",
  },
}
```

The `.openp41ge/` directory at the project root already has meaning — it's where
the agent chat stores context (via `plans/`). Adding `config.json` there is
consistent with that convention.

## SOLID Principles Alignment

### Single Responsibility — ConfigService does too much

The current `ConfigService` handles:

1. Loading config from filesystem
2. Deep-merging config layers
3. Schema validation (via JSON Schema)
4. Change detection (via `fs.watchFile`)
5. Providing config to consumers

**Refactoring target**: Split into separate classes with single responsibilities:

```typescript
// 1. Loads config from a source
interface IConfigLoader {
  load(): Promise<Record<string, unknown>>;
}
class FileConfigLoader implements IConfigLoader {
  constructor(private _path: string) {}
}
class DefaultConfigLoader implements IConfigLoader {
  constructor(private _bundledConfig: Record<string, unknown>) {}
}

// 2. Merges multiple config layers
interface IConfigMerger {
  merge(...layers: Record<string, unknown>[]): Record<string, unknown>;
}
class DeepMergeConfigMerger implements IConfigMerger {
  merge(...layers) { /* deep merge, arrays replaced */ }
}

// 3. Validates config
interface IConfigValidator {
  validate(config: Record<string, unknown>): ValidationResult;
}
class JsonSchemaValidator implements IConfigValidator {
  constructor(private _schema: JSONSchema) {}
}

// 4. ConfigManager orchestrates the three
class ConfigManager {
  constructor(
    private _defaultLoader: IConfigLoader,
    private _userLoader: IConfigLoader,
    private _repoLoader: IConfigLoader,
    private _merger: IConfigMerger,
    private _validator: IConfigValidator,
  ) {}

  async getConfig(): Promise<MergedConfig> { ... }
}
```

### Dependency Inversion

- `ConfigManager` depends on `IConfigLoader` × 3, `IConfigMerger`, and
  `IConfigValidator` — all abstractions.
- `FileConfigLoader` depends on `IFileSystem` (model-based DI pattern) so
  tests can use `InMemoryFileSystem` instead of real files.
- The `ElectronConfigManager` production implementation wires up real loaders;
  the test implementation uses `InMemoryConfigLoader`.

### Interface Segregation

- `IConfigReader` (read-only operations)
- `IConfigWriter` (write operations like saving config)
- `IConfigLoader` (loading from source)
- Segregate by capability, not by implementation.

### Open/Closed

- The JSON Schema approach is already OCP-friendly: new config properties
  just add entries to the schema and default config.
- The `syntaxExtensions` map is a good example of extension without modification
  to core logic — the merge chain handles it generically.

### Edge case: ConfigService interface stability

If `ConfigManager` is used across multiple consumers, define a stable
`IConfigProvider` interface:

```typescript
interface IConfigProvider {
  getConfig(): MergedConfig;
  onConfigChange(callback: (config: MergedConfig) => void): void;
}
```

Then `ConfigManager` implements `IConfigProvider`, and all consumers depend
on the interface, not the concrete class.

## Merge order

```
app defaults  ←  user config  ←  repo config
(lowest)                        (highest)
```

Each layer's values override the previous:

1. Start with `config.json` (app defaults)
2. Deep merge `~/.openp41ge/user/config.json` on top
3. Deep merge `<cwd>/.openp41ge/config.json` on top

Deep merge rules:

- Objects: recurse into properties, override at the leaf level
- Primitive values: last writer wins
- Arrays: replaced entirely (not merged) — same as JSON Schema merge patch

## Integration with `syntaxExtensions`

The new `syntaxExtensions` map lives in the merged config. The
`_initWithModel` method in `file-editor.ts` currently looks up language ID
from the `TokenRegistry` via `getLanguageId(extension)`.

The lookup is updated to check `syntaxExtensions[extension]` FIRST, before
falling back to the built-in `TokenRegistry.getLanguageId()`:

```typescript
// file-editor.ts — _initWithModel()
const extLangId = mergedConfig.syntaxExtensions?.[rawExt];
const langId = extLangId || tokenRegistry.getLanguageId(rawExt);
```

## New / Modified Files

### New

| File                         | Purpose                                                  |
| ---------------------------- | -------------------------------------------------------- |
| `schemas/config.schema.json` | JSON Schema defining the config structure                |
| `config.json`                | App default config (replaces hardcoded `DEFAULT_CONFIG`) |

### Modified

| File                                                                        | Change                                                                                                                             |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `packages/openp41ge/src/main/services/config-service.ts`                    | Load app defaults from `config.json`; load and merge repo config from `.openp41ge/config.json`; add `syntaxExtensions` to the type |
| `packages/openp41ge/src/renderer/services/config-service.ts`                | Update `UserConfig` type to include `syntaxExtensions`                                                                             |
| `packages/openp41ge/src/renderer/global.d.ts`                               | No change needed (preload bridge is generic)                                                                                       |
| `packages/openp41ge-file-editor/src/file-editor.ts`                         | Check `syntaxExtensions` in `_initWithModel()` before `TokenRegistry.getLanguageId()`                                              |
| `packages/openp41ge/electron/main.ts`                                       | Pass repo root path to `ConfigService` for `.openp41ge/config.json` resolution                                                     |
| `packages/openp41ge/electron/ipc-handlers/config-handlers.ts`               | No change needed (IPC is already generic)                                                                                          |
| `packages/openp41ge/src/main/services/__tests__/config-service.test.ts`     | Update tests for new merge behavior                                                                                                |
| `packages/openp41ge/src/renderer/services/__tests__/config-service.test.ts` | Update tests for `syntaxExtensions`                                                                                                |
| `.gitignore`                                                                | Add `.openp41ge/config.json` (repo config is local-only)                                                                           |

## Files Not Modified (out of scope)

- `packages/openp41ge/electron/preload.cjs` — bridge is already generic
- `packages/openp41ge-file-editor/src/tokenization/token-registry.ts` — no change to built-in mappings
- `packages/openp41ge/src/renderer/components/openp41ge-windowview.ts` — theme picker works from merged config
- `packages/openp41ge/src/renderer/app.ts` — already uses `ConfigService` generically

## Edge Cases

| Case                                                 | Behavior                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| No `.openp41ge/config.json`                          | Repo config layer is skipped (no error)                                    |
| No `~/.openp41ge/user/config.json`                   | User config layer is skipped (no error)                                    |
| Repo config has invalid syntax                       | Parse error logged, layer skipped                                          |
| `syntaxExtensions` extension conflicts with built-in | Repo/user extension wins (user layer overrides app defaults)               |
| `.openp41ge/` directory missing entirely             | Created on first write or silently skipped on read                         |
| File opened outside a repo (no `.openp41ge/`)        | No repo config applied                                                     |
| `syntaxExtensions` points to non-existent language   | `TokenRegistry.getLanguageId()` returns undefined → fallback to plain text |
| Config file changes externally                       | Detected via existing `fs.watchFile` on all loaded config files            |

## Completion Criteria

- [ ] `schemas/config.schema.json` defines the full config structure with `syntaxExtensions`
- [ ] `config.json` at repo root holds app defaults (same values as current `DEFAULT_CONFIG`)
- [ ] `ConfigService` loads `config.json` as the base layer (from app bundle path)
- [ ] User config at `~/.openp41ge/user/config.json` merges over app defaults
- [ ] Repo config at `<cwd>/.openp41ge/config.json` merges over user config
- [ ] Both `syntaxThemes` and `syntaxExtensions` flow through the merge chain
- [ ] `file-editor.ts` checks `syntaxExtensions` before `TokenRegistry.getLanguageId()`
- [ ] All existing 524+ tests pass after changes
- [ ] Build succeeds for both packages
- [ ] `.openp41ge/config.json` added to `.gitignore`
