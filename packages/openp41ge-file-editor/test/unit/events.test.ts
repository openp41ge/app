import { describe, it, expect } from "vitest";
import {
  EVENT_TITLE_CHANGED,
  EVENT_DIRTY_CHANGED,
  EVENT_FILE_SAVED,
  EVENT_REQUEST_CLOSE,
} from "@openp41ge-file-editor/events";

describe("event constants", () => {
  it("have correct string values", () => {
    expect(EVENT_TITLE_CHANGED).toBe("fe:title-changed");
    expect(EVENT_DIRTY_CHANGED).toBe("fe:dirty-changed");
    expect(EVENT_FILE_SAVED).toBe("fe:file-saved");
    expect(EVENT_REQUEST_CLOSE).toBe("fe:request-close");
  });
});
