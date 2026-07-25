import { registerOpenp41geTerminal } from "openp41ge-terminal/index";
import type { Terminal } from "@xterm/xterm";

registerOpenp41geTerminal();

const container = document.getElementById("terminal-container")!;

// Create a mock terminal connector
const shellConnector = {
  start: () => {
    // Write a welcome message directly to the terminal
    const terminal = (container.querySelector("openp41ge-terminal") as any)?.terminal as Terminal;
    if (terminal) {
      terminal.writeln("Welcome to openp41ge-terminal demo!\\r\\n");
      terminal.writeln("This is a mock terminal (no real shell attached).\\r\\n");
      terminal.write("$ ");
    }
  },
  write: (data: string) => {
    const terminal = (container.querySelector("openp41ge-terminal") as any)?.terminal as Terminal;
    if (terminal) {
      terminal.write(data);
    }
  },
  resize: () => {},
  destroy: () => {},
};

const term = document.createElement("openp41ge-terminal");
term.setAttribute("style", "height: 100%");
(term as any).shellConnector = shellConnector;
container.appendChild(term);
