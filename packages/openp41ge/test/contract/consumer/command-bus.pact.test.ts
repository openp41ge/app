/**
 * Consumer-side contract tests — Command bus (dispatcher ↔ workspace state).
 *
 * Defines the expected action names, payload shapes, and state transitions
 * for workspace dispatch operations.
 *
 * The command bus (ICommandBus) dispatches named operations with arguments
 * to the workspace state manager in the main process. These contracts ensure
 * that the renderer (consumer) and the main process (provider) agree on the
 * shape of every operation.
 */

import { PactV4 } from "@pact-foundation/pact";
import { MatchersV3 } from "@pact-foundation/pact/src/v3";
import { describe, it, expect } from "vitest";
import { pactOptions } from "../helpers/pact-setup";

const { like, string } = MatchersV3;

const provider = new PactV4(pactOptions("dispatcher", "workspace-state-manager"));

// ─── Command Bus Dispatch Contracts ───────────────────────────────────

describe("Command bus dispatch contracts", () => {
  it("addTabToCell adds a new tab to a cell", async () => {
    await provider
      .addInteraction()
      .given("grid is empty")
      .uponReceiving("a dispatch of addTabToCell")
      .withRequest("POST", "/dispatch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          fn: string("addTabToCell"),
          args: like(["win-1", { id: "tab-1", appType: "terminal", title: "Terminal" }, 0, 0]),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(like({ success: true }));
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fn: "addTabToCell",
            args: ["win-1", { id: "tab-1", appType: "terminal", title: "Terminal" }, 0, 0],
          }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
      });
  });

  it("removeTabFromCell removes a tab from a cell", async () => {
    await provider
      .addInteraction()
      .given("grid has tabs")
      .uponReceiving("a dispatch of removeTabFromCell")
      .withRequest("POST", "/dispatch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          fn: string("removeTabFromCell"),
          args: like(["win-1", "tab-1"]),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(like({ success: true }));
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fn: "removeTabFromCell", args: ["win-1", "tab-1"] }),
        });
        expect(res.status).toBe(200);
      });
  });

  it("switchTabInCell switches the active tab in a cell", async () => {
    await provider
      .addInteraction()
      .given("")
      .uponReceiving("a dispatch of switchTabInCell")
      .withRequest("POST", "/dispatch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          fn: string("switchTabInCell"),
          args: like(["win-1", "tab-2", 0, 0]),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(like({ success: true }));
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fn: "switchTabInCell", args: ["win-1", "tab-2", 0, 0] }),
        });
        expect(res.status).toBe(200);
      });
  });

  it("splitColumn splits a column into two", async () => {
    await provider
      .addInteraction()
      .given("")
      .uponReceiving("a dispatch of splitColumn")
      .withRequest("POST", "/dispatch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          fn: string("splitColumn"),
          args: like(["win-1"]),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(like({ success: true }));
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fn: "splitColumn", args: ["win-1"] }),
        });
        expect(res.status).toBe(200);
      });
  });

  it("detachTabToWindow detaches a tab to a new window", async () => {
    await provider
      .addInteraction()
      .given("")
      .uponReceiving("a dispatch of detachTabToWindow")
      .withRequest("POST", "/dispatch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          fn: string("detachTabToWindow"),
          args: like(["win-1", "tab-1", { x: 100, y: 100, width: 800, height: 600 }]),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(like({ success: true }));
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fn: "detachTabToWindow",
            args: ["win-1", "tab-1", { x: 100, y: 100, width: 800, height: 600 }],
          }),
        });
        expect(res.status).toBe(200);
      });
  });

  it("resizeGrid changes grid dimensions", async () => {
    await provider
      .addInteraction()
      .given("")
      .uponReceiving("a dispatch of resizeGrid")
      .withRequest("POST", "/dispatch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          fn: string("resizeGrid"),
          args: like(["win-1", 2, 3]),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(like({ success: true }));
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fn: "resizeGrid", args: ["win-1", 2, 3] }),
        });
        expect(res.status).toBe(200);
      });
  });

  it("updateTabTitle updates a tab's title", async () => {
    await provider
      .addInteraction()
      .given("")
      .uponReceiving("a dispatch of updateTabTitle")
      .withRequest("POST", "/dispatch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          fn: string("updateTabTitle"),
          args: like(["tab-1", "New Title"]),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(like({ success: true }));
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fn: "updateTabTitle", args: ["tab-1", "New Title"] }),
        });
        expect(res.status).toBe(200);
      });
  });

  it("updateTabConfig updates a tab config value", async () => {
    await provider
      .addInteraction()
      .given("")
      .uponReceiving("a dispatch of updateTabConfig")
      .withRequest("POST", "/dispatch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          fn: string("updateTabConfig"),
          args: like(["tab-1", "filePath", "/repos/openp41ge/src/index.ts"]),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(like({ success: true }));
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fn: "updateTabConfig",
            args: ["tab-1", "filePath", "/repos/openp41ge/src/index.ts"],
          }),
        });
        expect(res.status).toBe(200);
      });
  });

  it("moveTabBetweenCells moves a tab between cells", async () => {
    await provider
      .addInteraction()
      .given("")
      .uponReceiving("a dispatch of moveTabBetweenCells")
      .withRequest("POST", "/dispatch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          fn: string("moveTabBetweenCells"),
          args: like(["win-1", "tab-1", "win-1", 0, 1]),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(like({ success: true }));
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fn: "moveTabBetweenCells",
            args: ["win-1", "tab-1", "win-1", 0, 1],
          }),
        });
        expect(res.status).toBe(200);
      });
  });

  it("addColumnTab adds a new column with a default tab", async () => {
    await provider
      .addInteraction()
      .given("")
      .uponReceiving("a dispatch of addColumnTab")
      .withRequest("POST", "/dispatch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          fn: string("addColumnTab"),
          args: like(["win-1"]),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(like({ success: true }));
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fn: "addColumnTab", args: ["win-1"] }),
        });
        expect(res.status).toBe(200);
      });
  });

  it("reorderTabsInCell reorders tabs within a cell", async () => {
    await provider
      .addInteraction()
      .given("")
      .uponReceiving("a dispatch of reorderTabsInCell")
      .withRequest("POST", "/dispatch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          fn: string("reorderTabsInCell"),
          args: like(["win-1", 0, 0, 1, 0]),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(like({ success: true }));
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fn: "reorderTabsInCell", args: ["win-1", 0, 0, 1, 0] }),
        });
        expect(res.status).toBe(200);
      });
  });

  it("closeWindow closes a window", async () => {
    await provider
      .addInteraction()
      .given("")
      .uponReceiving("a dispatch of closeWindow")
      .withRequest("POST", "/dispatch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          fn: string("closeWindow"),
          args: like(["win-1"]),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(like({ success: true }));
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fn: "closeWindow", args: ["win-1"] }),
        });
        expect(res.status).toBe(200);
      });
  });

  it("splitTabFromCell splits a cell by moving a tab to a new column", async () => {
    await provider
      .addInteraction()
      .given("")
      .uponReceiving("a dispatch of splitTabFromCell")
      .withRequest("POST", "/dispatch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          fn: string("splitTabFromCell"),
          args: like(["win-1", "ws-1", "tab-1", 0, true]),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(like({ success: true }));
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fn: "splitTabFromCell",
            args: ["win-1", "ws-1", "tab-1", 0, true],
          }),
        });
        expect(res.status).toBe(200);
      });
  });

  it("splitTabFromCell with focusTabId splits and focuses remaining tab", async () => {
    await provider
      .addInteraction()
      .given("")
      .uponReceiving("a dispatch of splitTabFromCell with focusTabId")
      .withRequest("POST", "/dispatch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          fn: string("splitTabFromCell"),
          args: like(["win-1", "ws-1", "tab-2", 0, false, "tab-1"]),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(like({ success: true }));
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fn: "splitTabFromCell",
            args: ["win-1", "ws-1", "tab-2", 0, false, "tab-1"],
          }),
        });
        expect(res.status).toBe(200);
      });
  });

  it("moveTabToWindow moves a tab to a different window's first column", async () => {
    await provider
      .addInteraction()
      .given("")
      .uponReceiving("a dispatch of moveTabToWindow")
      .withRequest("POST", "/dispatch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          fn: string("moveTabToWindow"),
          args: like(["tab-1", "win-2", 0, 0]),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(like({ success: true }));
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fn: "moveTabToWindow",
            args: ["tab-1", "win-2", 0, 0],
          }),
        });
        expect(res.status).toBe(200);
      });
  });

  it("activateTabInCell activates a tab in its cell without reordering", async () => {
    await provider
      .addInteraction()
      .given("")
      .uponReceiving("a dispatch of activateTabInCell")
      .withRequest("POST", "/dispatch", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          fn: string("activateTabInCell"),
          args: like(["win-1", "ws-1", "tab-1"]),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(like({ success: true }));
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fn: "activateTabInCell",
            args: ["win-1", "ws-1", "tab-1"],
          }),
        });
        expect(res.status).toBe(200);
      });
  });
});
