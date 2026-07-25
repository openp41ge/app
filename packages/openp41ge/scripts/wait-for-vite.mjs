import http from "http";
await new Promise((resolve) => {
  const poll = () =>
    http.get("http://localhost:5173", resolve).on("error", () => setTimeout(poll, 300));
  poll();
});
