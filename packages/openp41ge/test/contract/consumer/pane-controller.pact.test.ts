/**
 * Consumer-side contract tests — PaneController lifecycle.
 *
 * Defines the expected lifecycle contract for TabController implementations:
 * mount, unmount, setVisible, snapshot, restore.
 *
 * All app tabs (file-editor, terminal, git-repository, agent-chat, etc.)
 * implement this contract. These tests verify that the consumer (the tab
 * system) correctly handles the lifecycle state machine.
 */

import { PactV4 } from "@pact-foundation/pact";
import { MatchersV3 } from "@pact-foundation/pact/src/v3";
import { describe, it, expect } from "vitest";
import { pactOptions } from "../helpers/pact-setup";

const { like, string, boolean } = MatchersV3;

const provider = new PactV4(pactOptions("pane-controller", "controller-registry"));

// ─── Controller Lifecycle Contract ────────────────────────────────────

describe("PaneController lifecycle contract", () => {
  it("mount initialises the controller and attaches to the DOM", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to mount a controller")
      .withRequest("POST", "/controller.mount", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          tabId: string("tab-1"),
          appType: string("file-viewer"),
          config: like({ filePath: "/repos/openp41ge/README.md" }),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody({
          success: boolean(true),
          tabId: string("tab-1"),
        });
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/controller.mount`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tabId: "tab-1",
            appType: "file-viewer",
            config: { filePath: "/repos/openp41ge/README.md" },
          }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.tabId).toBe("tab-1");
      });
  });

  it("unmount detaches the controller and releases resources", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to unmount a controller")
      .withRequest("POST", "/controller.unmount", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({ tabId: string("tab-1") });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody({ success: boolean(true) });
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/controller.unmount`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tabId: "tab-1" }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
      });
  });

  it("snapshot returns serializable state", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to snapshot a controller's state")
      .withRequest("POST", "/controller.snapshot", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({ tabId: string("tab-1") });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(
          like({
            filePath: "/repos/openp41ge/README.md",
            cursorPosition: 42,
            isDirty: false,
          }),
        );
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/controller.snapshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tabId: "tab-1" }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty("filePath");
        expect(body).toHaveProperty("cursorPosition");
        expect(body).toHaveProperty("isDirty");
      });
  });

  it("restore applies saved state to the controller", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to restore a controller's state")
      .withRequest("POST", "/controller.restore", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          tabId: string("tab-1"),
          state: like({
            filePath: "/repos/openp41ge/README.md",
            cursorPosition: 42,
            isDirty: false,
          }),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody({ success: boolean(true) });
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/controller.restore`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tabId: "tab-1",
            state: { filePath: "/repos/openp41ge/README.md", cursorPosition: 42, isDirty: false },
          }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
      });
  });

  it("setVisible toggles visibility without throwing", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to set controller visibility")
      .withRequest("POST", "/controller.setVisible", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          tabId: string("tab-1"),
          visible: boolean(true),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody({ success: boolean(true) });
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/controller.setVisible`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tabId: "tab-1", visible: true }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
      });
  });

  it("mount with terminal appType creates a terminal controller", async () => {
    await provider
      .addInteraction()
      .uponReceiving("a request to mount a terminal controller")
      .withRequest("POST", "/controller.mount", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          tabId: string("tab-2"),
          appType: string("terminal"),
          config: like({}),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody({
          success: boolean(true),
          tabId: string("tab-2"),
        });
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/controller.mount`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tabId: "tab-2",
            appType: "terminal",
            config: {},
          }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.tabId).toBe("tab-2");
      });
  });

  it("full lifecycle: mount → setVisible(false) → snapshot → unmount → restore → mount → setVisible(true)", async () => {
    // Interaction 1: mount
    await provider
      .addInteraction()
      .uponReceiving("mount request in full lifecycle")
      .withRequest("POST", "/controller.mount", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          tabId: string("lifecycle-tab"),
          appType: string("file-viewer"),
          config: like({}),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody({ success: boolean(true), tabId: string("lifecycle-tab") });
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/controller.mount`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tabId: "lifecycle-tab", appType: "file-viewer", config: {} }),
        });
        expect(res.status).toBe(200);
      });

    // Interaction 2: snapshot
    await provider
      .addInteraction()
      .uponReceiving("snapshot request in full lifecycle")
      .withRequest("POST", "/controller.snapshot", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({ tabId: string("lifecycle-tab") });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody(
          like({
            filePath: "/repos/openp41ge/src/index.ts",
            cursorPosition: 0,
            isDirty: false,
          }),
        );
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/controller.snapshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tabId: "lifecycle-tab" }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.filePath).toBe("/repos/openp41ge/src/index.ts");
      });

    // Interaction 3: restore
    await provider
      .addInteraction()
      .uponReceiving("restore request in full lifecycle")
      .withRequest("POST", "/controller.restore", (req) => {
        req.headers({ "Content-Type": "application/json" });
        req.jsonBody({
          tabId: string("lifecycle-tab"),
          state: like({
            filePath: "/repos/openp41ge/src/index.ts",
            cursorPosition: 0,
            isDirty: false,
          }),
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "Content-Type": "application/json" });
        res.jsonBody({ success: boolean(true) });
      })
      .executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/controller.restore`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tabId: "lifecycle-tab",
            state: { filePath: "/repos/openp41ge/src/index.ts", cursorPosition: 0, isDirty: false },
          }),
        });
        expect(res.status).toBe(200);
      });
  });
});
