/**
 * openp41ge-json-editor — smart, structured JSON layout component.
 *
 * Re-exports the <json-editor> web component, its event names, and the pure
 * tree/highlight helpers so consumers (and tests) can use them.
 */

export {
  JsonEditorElement,
  JSON_EDITOR_CHANGE,
  JSON_EDITOR_OPEN,
} from "./json-editor";

export { gutterWidthFor, GUTTER_PAD_PX, GUTTER_FOLD_PX, DEFAULT_DIGIT_PX } from "./json-editor";

export {
  cloneDeep,
  getAt,
  setAt,
  deleteEntry,
  renameKey,
  addEntry,
  isComposite,
  isArray,
  summarize,
} from "./json-tree";
export type { JsonPath } from "./json-tree";

export { tokenizeJsonText, highlightJsonToHtml, JSON_SCOPE_CLASS } from "./json-highlight";
export type { JsonToken, JsonScope } from "./json-highlight";

export { parseJson, JsonParseError } from "./json-parse";
export type { JsonNode, JsonError, JsonObjectMember, ParseResult } from "./json-parse";
export { computeFoldRanges, findEntryAtLine } from "./json-analyze";
export type { FoldRange, EntryMatch } from "./json-analyze";
export { tokenizeJsonFull, selectableRanges } from "./json-tokenize";
export type { JsonToken as JsonTokenFull, SelectableRange } from "./json-tokenize";
