/**
 * openp41ge-agents — Chat interface web component for AI agent interaction.
 *
 * Exports the <openp41ge-agents> custom element class and supporting types.
 * The component is fully self-contained and intended to be mounted inside a tab.
 */

export { Openp41geAgents, registerOpenp41geAgents } from "./ui/openp41ge-agents";
export type {
  Chat,
  ChatMessage,
  ChatDeltaPayload,
  ChatRuntimeStatus,
  ChatSearchOptions,
  ChatSearchResult,
  ChatStatusPayload,
  ChatSummary,
  ChatToolPayload,
  ToolCall,
  ToolCallStatus,
} from "./types";
export { chatLastPreview } from "./types";
