import React, { useEffect, useState } from "react";
import { addons, types } from "@storybook/manager-api";
import { AddonPanel } from "@storybook/components";

const ADDON_ID = "openp41ge/event-log";
const PANEL_ID = `${ADDON_ID}/panel`;

interface EventLogContentProps {
  events: string[];
  onClear: () => void;
}

const EventLogContent: React.FC<EventLogContentProps> = ({ events, onClear }) => {
  return React.createElement(
    "div",
    {
      style: {
        padding: "10px",
        fontFamily: "monospace",
        fontSize: "12px",
        overflowY: "auto",
        height: "100%",
        boxSizing: "border-box",
        background: "#1e1e1e",
      } as React.CSSProperties,
    },
    events.length === 0
      ? React.createElement(
          "div",
          { style: { color: "#888", padding: "8px" } as React.CSSProperties },
          "Waiting for events…",
        )
      : [
          ...events.map((event, i) =>
            React.createElement(
              "div",
              {
                key: i,
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
          React.createElement(
            "button",
            {
              key: "clear",
              onClick: onClear,
              style: {
                marginTop: "8px",
                padding: "4px 12px",
                background: "#333",
                border: "1px solid #555",
                borderRadius: "4px",
                color: "#ccc",
                cursor: "pointer",
                fontSize: "11px",
              } as React.CSSProperties,
            },
            "Clear",
          ),
        ],
  );
};

const EventLogPanelWrapper: React.FC = () => {
  const [events, setEvents] = useState<string[]>([]);

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

  return React.createElement(EventLogContent, {
    events,
    onClear: () => setEvents([]),
  });
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
