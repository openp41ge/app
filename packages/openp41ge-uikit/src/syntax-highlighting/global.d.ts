// Vite asset import declarations
declare module "*.wasm?url" {
  const url: string;
  export default url;
}
declare module "vscode-oniguruma/release/onig.wasm?url" {
  const url: string;
  export default url;
}

declare module "*.tmLanguage.json" {
  const grammar: any;
  export default grammar;
}
