import {
  createLogger,
  pushLog,
  LogLevel,
  subscribeLogs,
  getLogBuffer,
} from "openp41ge-logger/index";

// Set up display
const app = document.getElementById("app")!;
const log = createLogger("demo");
const output = document.createElement("pre");
output.style.overflow = "auto";
output.style.maxHeight = "400px";
app.appendChild(output);

function render() {
  const buffer = getLogBuffer();
  output.textContent = buffer
    .map((e) => `[${e.timestamp}] ${e.level} ${e.logger}: ${e.message}`)
    .join("\n");
}

subscribeLogs(() => render());

// Show initial log buffer
render();

// Demo buttons
const btnInfo = document.createElement("button");
btnInfo.textContent = "Log Info";
btnInfo.onclick = () =>
  pushLog({
    level: LogLevel.INFO,
    logger: "demo",
    message: "This is an info message",
    timestamp: Date.now(),
  });

const btnWarn = document.createElement("button");
btnWarn.textContent = "Log Warn";
btnWarn.onclick = () =>
  pushLog({
    level: LogLevel.WARN,
    logger: "demo",
    message: "This is a warning",
    timestamp: Date.now(),
  });

const btnError = document.createElement("button");
btnError.textContent = "Log Error";
btnError.onclick = () =>
  pushLog({
    level: LogLevel.ERROR,
    logger: "demo",
    message: "This is an error",
    timestamp: Date.now(),
  });

app.prepend(btnInfo, btnWarn, btnError);

// Initial log
log.info("openp41ge-logger demo started");
