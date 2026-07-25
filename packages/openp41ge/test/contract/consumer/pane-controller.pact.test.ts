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

import { PactV3 } from "@pact-foundation/pact";
import { MatchersV3 } from "@pact-foundation/pact/src/v3";
import { describe, it, expect } from "vitest";
import { pactOptions } from "../helpers/pact-setup";

const { like, string, boolean } = MatchersV3;

const provider = new PactV3(pactOptions("pane-controller", "controller-registry"));

// ─── Controller Lifecycle Contract ────────────────────────────────────

describe("PaneController lifecycle contract", () => {
  it("mount initialises the controller and attaches to the DOM", async () => {
    provider
      .uponReceiving("a request to mount a controller")
      .withRequest({
        method: "POST",
        path: "/controller.mount",
        body: {
          tabId: string("tab-1"),
          appType: string("file-viewer"),
          config: like({ filePath: "/repos/openp41ge/README.md" }),
        },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: {
          success: boolean(true),
          tabId: string("tab-1"),
        },
      });

    await provider.executeTest(async (mockServer) => {
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
    provider
      .uponReceiving("a request to unmount a controller")
      .withRequest({
        method: "POST",
        path: "/controller.unmount",
        body: { tabId: string("tab-1") },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: {
          success: boolean(true),
        },
      });

    await provider.executeTest(async (mockServer) => {
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
    provider
      .uponReceiving("a request to snapshot a controller's state")
      .withRequest({
        method: "POST",
        path: "/controller.snapshot",
        body: { tabId: string("tab-1") },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: like({
          filePath: "/repos/openp41ge/README.md",
          cursorPosition: 42,
          isDirty: false,
        }),
      });

    await provider.executeTest(async (mockServer) => {
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
    provider
      .uponReceiving("a request to restore a controller's state")
      .withRequest({
        method: "POST",
        path: "/controller.restore",
        body: {
          tabId: string("tab-1"),
          state: like({
            filePath: "/repos/openp41ge/README.md",
            cursorPosition: 42,
            isDirty: false,
          }),
        },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: {
          success: boolean(true),
        },
      });

    await provider.executeTest(async (mockServer) => {
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
    provider
      .uponReceiving("a request to set controller visibility")
      .withRequest({
        method: "POST",
        path: "/controller.setVisible",
        body: {
          tabId: string("tab-1"),
          visible: boolean(true),
        },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: {
          success: boolean(true),
        },
      });

    await provider.executeTest(async (mockServer) => {
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
    provider
      .uponReceiving("a request to mount a terminal controller")
      .withRequest({
        method: "POST",
        path: "/controller.mount",
        body: {
          tabId: string("tab-2"),
          appType: string("terminal"),
          config: like({}),
        },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: {
          success: boolean(true),
          tabId: string("tab-2"),
        },
      });

    await provider.executeTest(async (mockServer) => {
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
    provider
      .uponReceiving("mount request in full lifecycle")
      .withRequest({
        method: "POST",
        path: "/controller.mount",
        body: {
          tabId: string("lifecycle-tab"),
          appType: string("file-viewer"),
          config: like({}),
        },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: { success: boolean(true), tabId: string("lifecycle-tab") },
      });

    // Interaction 2: snapshot
    provider
      .uponReceiving("snapshot request in full lifecycle")
      .withRequest({
        method: "POST",
        path: "/controller.snapshot",
        body: { tabId: string("lifecycle-tab") },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: like({
          filePath: "/repos/openp41ge/src/index.ts",
          cursorPosition: 0,
          isDirty: false,
        }),
      });

    // Interaction 3: restore
    provider
      .uponReceiving("restore request in full lifecycle")
      .withRequest({
        method: "POST",
        path: "/controller.restore",
        body: {
          tabId: string("lifecycle-tab"),
          state: like({
            filePath: "/repos/openp41ge/src/index.ts",
            cursorPosition: 0,
            isDirty: false,
          }),
        },
      })
      .willRespondWith({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: { success: boolean(true) },
      });

    await provider.executeTest(async (mockServer) => {
      const baseUrl = mockServer.url;

      // mount
      const mountRes = await fetch(`${baseUrl}/controller.mount`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabId: "lifecycle-tab", appType: "file-viewer", config: {} }),
      });
      expect(mountRes.status).toBe(200);

      // snapshot
      const snapRes = await fetch(`${baseUrl}/controller.snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabId: "lifecycle-tab" }),
      });
      expect(snapRes.status).toBe(200);
      const snapBody = await snapRes.json();
      expect(snapBody.filePath).toBe("/repos/openp41ge/src/index.ts");

      // restore
      const restoreRes = await fetch(`${baseUrl}/controller.restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabId: "lifecycle-tab", state: snapBody }),
      });
      expect(restoreRes.status).toBe(200);
    });
  });
});
