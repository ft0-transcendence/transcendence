import { Game } from "@prisma/client";

export class AIPlayerService {
	private constructor() {
	}

	public static isAIPlayer(playerId: Game['leftPlayerId'] | Game['rightPlayerId'], username: Game['leftPlayerUsername'] | Game['rightPlayerUsername']) {
		return playerId === null && username !== null;
	}
}
