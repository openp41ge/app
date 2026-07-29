import React, { useEffect, useState, useCallback } from "react";
import { addons, types } from "@storybook/manager-api";
import { AddonPanel } from "@storybook/components";

const ADDON_ID = "openp41ge/event-log";
const PANEL_ID = `${ADDON_ID}/panel`;

const eventsContainerStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "4px 10px",
  fontFamily: "monospace",
  fontSize: "12px",
};

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  gap: "6px",
  alignItems: "center",
  padding: "6px 10px",
  borderTop: "1px solid #333",
  background: "#1e1e1e",
  flexShrink: 0,
};

const btnStyle: React.CSSProperties = {
  padding: "4px 12px",
  background: "#333",
  border: "1px solid #555",
  borderRadius: "4px",
  color: "#ccc",
  cursor: "pointer",
  fontSize: "11px",
};

const EventLogPanelWrapper: React.FC = () => {
  const [events, setEvents] = useState<string[]>([]);
  const [reverse, setReverse] = useState(true);

  useEffect(() => {
    const channel = addons.getChannel();
    const handler = (event: string) => {
      setEvents((prev) => [...prev, event]);
    };
    channel.on("openp41ge/event" as any, handler);
    return () => {
      channel.off("openp41ge/event" as any, handler);
    };
  }, []);

  const toggleReverse = useCallback(() => setReverse((r) => !r), []);
  const clearAll = useCallback(() => setEvents([]), []);

  const visible = reverse ? [...events].reverse() : events;

  return React.createElement(
    "div",
    { style: { display: "flex", flexDirection: "column", height: "100%" } as React.CSSProperties },
    // ── Event list ──
    React.createElement(
      "div",
      { style: eventsContainerStyle },
      visible.length === 0
        ? React.createElement("div", { style: { color: "#888", padding: "8px" } as React.CSSProperties }, "Waiting for events…")
        : visible.map((event, i) =>
            React.createElement(
              "div",
              {
                key: reverse ? events.length - 1 - i : i,
                style: {
                  padding: "3px 0",
                  color: "#ccc",
                  borderBottom: "1px solid #333",
                  lineHeight: "1.4",
                } as React.CSSProperties,
              },
              `[${i + 1}] ${event}`,
            ),
          ),
    ),
    // ── Fixed toolbar at bottom ──
    React.createElement(
      "div",
      { style: toolbarStyle },
      React.createElement(
        "button",
        { key: "reverse", onClick: toggleReverse, style: btnStyle },
        reverse ? "Oldest first ▼" : "Newest first ▲",
      ),
      React.createElement(
        "button",
        { key: "clear", onClick: clearAll, style: btnStyle },
        "Clear",
      ),
    ),
  );
};

addons.register(ADDON_ID, () => {
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: "Event Log",
    match: ({ viewMode }) => viewMode === "story",
    render: ({ active }) =>
      React.createElement(
        AddonPanel,
        { active, key: "event-log" } as any,
        React.createElement(EventLogPanelWrapper, null),
      ),
  });
});
