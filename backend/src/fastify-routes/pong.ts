import { FastifyPluginAsync } from "fastify";
import { Game } from "../../../game/game";

const game = new Game();

export const pongRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/state", async () => game.getState());
  fastify.post("/start", async () => { game.start(); return { status: "started" }; });
  fastify.post("/pause", async () => { game.pause(); return { status: "paused" }; });
  fastify.post("/resume", async () => { game.resume(); return { status: "resumed" }; });
  fastify.post("/move", async (request) => {
    const { player, direction } = request.body as { player: "left" | "right", direction: "up" | "down" };
    game.movePaddle(player, direction);
    return { status: "paddle moved" };
  });
};