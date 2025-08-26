import { Game } from "../../game/game";

export const game = new Game();

let lastUpdateTimestamp = Date.now();
setInterval(() => {
    const now = Date.now();
    const delta = now - lastUpdateTimestamp;
    lastUpdateTimestamp = now;
    try {
        game.update(delta);
    } catch {
        // keep loop alive
    }
}, 16);


