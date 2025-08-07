export const PongApi = {
  getState: () =>
    fetch("/api/pong/state").then(r => r.json()),
  start: () =>
    fetch("/api/pong/start", { method: "POST" }).then(r => r.json()),
  pause: () =>
    fetch("/api/pong/pause", { method: "POST" }).then(r => r.json()),
  resume: () =>
    fetch("/api/pong/resume", { method: "POST" }).then(r => r.json()),
  move: (player: "left" | "right", direction: "up" | "down") =>
    fetch("/api/pong/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player, direction }),
    }).then(r => r.json()),
};