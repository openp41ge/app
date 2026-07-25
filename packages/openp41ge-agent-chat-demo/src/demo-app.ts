/**
 * demo-app.ts — Standalone demo application for the agent chat component.
 *
 * Mounts a <openp41ge-agent-chat> element, provides sidebar controls to send
 * predefined messages and simulate assistant responses, and logs chat-message
 * events to a console output panel.
 */

import "openp41ge-agent-chat";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConsoleLogEntry {
  timestamp: string;
  message: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const logs: ConsoleLogEntry[] = [];
let logLimit = 200;
let messageCounter = 0;

// DOM references (set during init)
let chatPanelEl: HTMLElement | null = null;
let consoleBodyEl: HTMLElement | null = null;
let chatComponent: HTMLElement | null = null;

// ---------------------------------------------------------------------------
// Mock assistant responses
// ---------------------------------------------------------------------------

const mockResponses = [
  "I can help you with that! Here's what I know about the codebase:\n\nThe Openp41ge monorepo is organised into several packages, each responsible for a specific feature area. The main platform package (`openp41ge`) manages the layout data model, window management, and IPC communication.\n\nWhat would you like to know more about?",
  "Great question! Let me look into that for you.\n\nBased on my analysis, the drag-and-drop system in `openp41ge-grid.ts` uses module-level state variables to track drag operations across DOM re-creations. There are three main drop scenarios:\n\n1. **Same-tab**: Moves within the existing grid\n2. **Cross-tab**: Adds a column and places the pane\n3. **Cross-window**: Same as cross-tab but across windows\n\nYou can find the relevant code in `src/renderer/components/`.",
  "Here's a quick summary of the project structure:\n\n```\npackages/\n├── openp41ge/                  # Electron desktop app\n├── openp41ge-file-editor/      # File editor component\n├── openp41ge-git-repository/   # Git browser\n├── openp41ge-terminal/         # Terminal emulator\n├── openp41ge-agent-chat/       # AI chat (this one!)\n└── openp41ge-logger/           # Logging utility\n```\n\nEach package communicates with the platform through DOM CustomEvents and the workspace state.",
  "Let me run that analysis for you...\n\n**Results:**\n- Build time: 12.4s\n- Bundle size: 2.3 MB\n- Total modules: 1,247\n- Unused exports found: 3\n- Circular dependencies: None\n\nWould you like me to detail any of these findings?",
  'Here\'s an example of how to register a new app type:\n\n```typescript\nimport { registerAppType } from "src/renderer/apps/app-registry";\n\nregisterAppType({\n  type: "my-app",\n  createController: (tabId) => new MyController(tabId),\n});\n```\n\nThe controller must implement the `TabController` interface with `mount`, `unmount`, `setVisible`, `snapshot`, and `restore` methods.',
];

function getRandomResponse(): string {
  return mockResponses[Math.floor(Math.random() * mockResponses.length)];
}

// ---------------------------------------------------------------------------
// Console Logging
// ---------------------------------------------------------------------------

function timeStr(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

function addLog(message: string): void {
  logs.push({ timestamp: timeStr(), message });
  if (logs.length > logLimit) logs.shift();
  renderLogs();
}

function renderLogs(): void {
  if (!consoleBodyEl) return;
  consoleBodyEl.innerHTML = logs
    .map(
      (l) =>
        `<div class="log-entry"><span class="timestamp">[${l.timestamp}]</span>${escapeHtml(l.message)}</div>`,
    )
    .join("");
  consoleBodyEl.scrollTop = consoleBodyEl.scrollHeight;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Chat Panel Render
// ---------------------------------------------------------------------------

function renderChatPanel(): void {
  if (!chatPanelEl) return;
  chatPanelEl.innerHTML = "";

  const chat = document.createElement("openp41ge-agent-chat");
  chat.style.width = "100%";
  chat.style.height = "100%";
  chat.style.display = "flex";
  chatPanelEl.appendChild(chat);
  chatComponent = chat;

  // Listen for messages from the chat component
  chat.addEventListener("chat-message", ((e: CustomEvent) => {
    addLog(`User sent: "${e.detail.text}"`);
  }) as EventListener);
}

// ---------------------------------------------------------------------------
// Action Handlers
// ---------------------------------------------------------------------------

function sendUserMessage(): void {
  const messages = [
    "Can you explain the architecture?",
    "How does the drag-and-drop work?",
    "Show me the project structure",
    "Run a build analysis",
    "How do I add a new app type?",
  ];
  const msg = messages[messageCounter % messages.length];
  messageCounter++;

  if (!chatComponent) return;
  (chatComponent as any).addMessage("user", msg);
  addLog(`Sent: "${msg}"`);
}

function simulateResponse(): void {
  if (!chatComponent) return;
  const response = getRandomResponse();
  (chatComponent as any).addMessage("assistant", response);
  addLog(`Assistant: "${response.slice(0, 50)}..."`);
}

function simulateTyping(): void {
  if (!chatComponent) return;
  (chatComponent as any).addMessage(
    "assistant",
    "Let me think about that...\n\nI'm processing your request and gathering information from the codebase. This may take a moment.\n\n_analysing files..._\n\nI've found the relevant information. Here's what I can tell you:\n\nThe system uses a modular architecture where each component is self-contained and communicates through well-defined interfaces. This makes it easy to extend and maintain.",
  );
  addLog("Assistant: Simulated typing response");
}

function clearMessages(): void {
  if (!chatComponent) return;
  (chatComponent as any).clearMessages();
  addLog("Cleared all messages");
}

function resetAll(): void {
  messageCounter = 0;
  if (!chatComponent) return;
  (chatComponent as any).clearMessages();
  addLog("Reset all — messages cleared");
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function init(): void {
  // Get DOM refs
  chatPanelEl = document.getElementById("chat-panel");
  consoleBodyEl = document.getElementById("console-body");

  if (!chatPanelEl) {
    console.error("Chat panel element (#chat-panel) not found");
    return;
  }

  // Initial render
  addLog("Demo initialized — rendering chat component");
  renderChatPanel();

  // Wire sidebar controls
  wireControl("btn-send-user", sendUserMessage);
  wireControl("btn-simulate-response", simulateResponse);
  wireControl("btn-loading", simulateTyping);
  wireControl("btn-clear", clearMessages);
  wireControl("btn-reset", resetAll);

  // Focus the input after render
  setTimeout(() => {
    if (chatComponent) {
      (chatComponent as any).focusInput?.();
    }
  }, 100);
}

function wireControl(id: string, handler: () => void): void {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("click", handler);
  } else {
    console.warn(`Control element #${id} not found`);
  }
}

// Boot on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Export for debugging from DevTools
(window as any).__demoState = {
  sendMessage: sendUserMessage,
  simulateResponse,
  clearMessages,
};
