/**
 * TextMate initialization — loads oniguruma WASM and creates a vscode-textmate Registry.
 *
 * The oniguruma WASM file is bundled alongside the grammars and loaded via fetch.
 *
 * Usage:
 *   const { registry, onigLib } = await initTextMate();
 *   const grammar = await registry.loadGrammar('source.js');
 */

import { Registry } from "vscode-textmate";
import { loadWASM, createOnigScanner, createOnigString } from "vscode-oniguruma";
import type { IOnigLib, IRawGrammar } from "vscode-textmate";

import jsGrammar from "./grammars/javascript.tmLanguage.json";
import jsxGrammar from "./grammars/javascriptreact.tmLanguage.json";
import tsGrammar from "./grammars/typescript.tmLanguage.json";
import tsxGrammar from "./grammars/typescriptreact.tmLanguage.json";
import jsonGrammar from "./grammars/json.tmLanguage.json";
import htmlGrammar from "./grammars/html.tmLanguage.json";
import cssGrammar from "./grammars/css.tmLanguage.json";
import yamlGrammar from "./grammars/yaml.tmLanguage.json";
import markdownGrammar from "./grammars/markdown.tmLanguage.json";
import shellGrammar from "./grammars/shell-unix-bash.tmLanguage.json";
import pythonGrammar from "./grammars/python.tmLanguage.json";
import rustGrammar from "./grammars/rust.tmLanguage.json";
import goGrammar from "./grammars/go.tmLanguage.json";
import javaGrammar from "./grammars/java.tmLanguage.json";
import cGrammar from "./grammars/c.tmLanguage.json";
import cppGrammar from "./grammars/cpp.tmLanguage.json";
import rubyGrammar from "./grammars/ruby.tmLanguage.json";
import phpGrammar from "./grammars/php.tmLanguage.json";
import sqlGrammar from "./grammars/sql.tmLanguage.json";
import tomlGrammar from "./grammars/toml.tmLanguage.json";
import dockerfileGrammar from "./grammars/docker.tmLanguage.json";
import hclGrammar from "./grammars/hcl.tmLanguage.json";
import terraformGrammar from "./grammars/terraform.tmLanguage.json";
import { getOnigWasmBase64 } from "./grammars/onig-data";
import type { IRawTheme } from "vscode-textmate";
import { darkPlusTheme } from "openp41ge-uikit/theme";

/**
 * The IOnigLib implementation that vscode-textmate needs.
 */
class OnigLib implements IOnigLib {
  createOnigScanner(patterns: string[]) {
    return createOnigScanner(patterns);
  }
  createOnigString(s: string) {
    return createOnigString(s);
  }
}

let _initPromise: Promise<{ registry: Registry; onigLib: IOnigLib }> | null = null;

/**
 * Load the oniguruma WASM and create a vscode-textmate Registry.
 *
 * Returns the same singleton on subsequent calls.
 */
export async function initTextMate(
  theme?: IRawTheme,
): Promise<{ registry: Registry; onigLib: IOnigLib }> {
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    // Load oniguruma WASM — decode base64 directly (avoids CSP issues with fetch(data:))
    const wasmBase64 = getOnigWasmBase64();
    const binaryString = atob(wasmBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    await loadWASM(bytes.buffer);

    const onigLib = new OnigLib();

    const registry = new Registry({
      onigLib: Promise.resolve(onigLib),
      loadGrammar: async (scopeName: string) => {
        return loadGrammarJson(scopeName);
      },
      theme: theme ?? darkPlusTheme.rawTheme,
    });

    // Pre-register all grammars
    for (const [_scopeName, rawGrammar] of GRAMMAR_MAP) {
      if (rawGrammar) {
        await registry.addGrammar(rawGrammar);
      }
    }

    return { registry, onigLib };
  })();

  return _initPromise;
}

const GRAMMAR_MAP: Array<[string, IRawGrammar | null]> = [
  ["source.js", jsGrammar as unknown as IRawGrammar],
  ["source.js.jsx", jsxGrammar as unknown as IRawGrammar],
  ["source.ts", tsGrammar as unknown as IRawGrammar],
  ["source.tsx", tsxGrammar as unknown as IRawGrammar],
  ["source.json", jsonGrammar as unknown as IRawGrammar],
  ["text.html.basic", htmlGrammar as unknown as IRawGrammar],
  ["source.css", cssGrammar as unknown as IRawGrammar],
  ["source.yaml", yamlGrammar as unknown as IRawGrammar],
  ["text.html.markdown", markdownGrammar as unknown as IRawGrammar],
  ["source.shell", shellGrammar as unknown as IRawGrammar],
  ["source.python", pythonGrammar as unknown as IRawGrammar],
  ["source.rust", rustGrammar as unknown as IRawGrammar],
  ["source.go", goGrammar as unknown as IRawGrammar],
  ["source.java", javaGrammar as unknown as IRawGrammar],
  ["source.c", cGrammar as unknown as IRawGrammar],
  ["source.cpp", cppGrammar as unknown as IRawGrammar],
  ["source.ruby", rubyGrammar as unknown as IRawGrammar],
  ["source.php", phpGrammar as unknown as IRawGrammar],
  ["source.sql", sqlGrammar as unknown as IRawGrammar],
  ["source.toml", tomlGrammar as unknown as IRawGrammar],
  ["source.dockerfile", dockerfileGrammar as unknown as IRawGrammar],
  ["source.hcl", hclGrammar as unknown as IRawGrammar],
  ["source.hcl.terraform", terraformGrammar as unknown as IRawGrammar],
];

function loadGrammarJson(scopeName: string): IRawGrammar | null {
  for (const [name, grammar] of GRAMMAR_MAP) {
    if (name === scopeName) return grammar;
  }
  return null;
}

/**
 * Reset the TextMate initialization (for testing).
 */
export function resetTextMateInit(): void {
  _initPromise = null;
}
