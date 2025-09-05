import { PrismaClient, User } from "@prisma/client";
import { Game } from "../../game/game";
import { OnlineGame } from "../../game/onlineGame";
import { TypedSocket } from "./socket-io";
import { FastifyInstance } from "fastify/types/instance";

export type Cache = {
	matchmaking: {
		connectedUsers: Set<User['id']>;
		queuedPlayers: TypedSocket[];
	},
	activeGames: Map<string, OnlineGame>;
}

/**
 * This file contains global cache data that is used by the application.
 * It is not persisted and is reset when the application is restarted.
 * It most likely will be used for keeping in memory data that should not be persisted on database, like matchmaking queues.
 */
export const cache: Cache = {
	matchmaking: {
		connectedUsers: new Set(),
		queuedPlayers: []
	},
	activeGames: new Map()
}


export async function loadActiveGamesIntoCache(db: PrismaClient, fastify: FastifyInstance) {
	const activeGames = await db.game.findMany({
		where: { endDate: null },
		include: { leftPlayer: true, rightPlayer: true },
	});

	for (const game of activeGames) {
		const gameInstance = new OnlineGame(
			game.id,
			null, // socketNamespace will be set when needed
			{
				maxScore: game.scoreGoal,
			},
			async (state) => {
				await db.game.update({
					where: { id: game.id },
					data: {
						endDate: new Date(),
						leftPlayerScore: state.scores.left,
						rightPlayerScore: state.scores.right,
					},
				});
				cache.activeGames.delete(game.id);
				fastify.log.info("Game %s persisted and removed from cache.", game.id);
			}
		);
		gameInstance.setPlayers({ ...game.leftPlayer }, { ...game.rightPlayer });
		gameInstance.scores.left = game.leftPlayerScore;
		gameInstance.scores.right = game.rightPlayerScore;

		cache.activeGames.set(game.id, gameInstance);
	}

	fastify.log.info(`Loaded ${activeGames.length} active games into cache`);
}
