import axios from "axios";

export const PongApi = {
  getState: () => axios.get("/api/pong/state").then(r => r.data),
  start: () => axios.post("/api/pong/start"),
  pause: () => axios.post("/api/pong/pause"),
  resume: () => axios.post("/api/pong/resume"),
  move: (player: "left" | "right", direction: "up" | "down") =>
    axios.post("/api/pong/move", { player, direction }),
};