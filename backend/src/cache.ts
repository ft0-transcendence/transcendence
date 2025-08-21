import { User } from "@prisma/client";
import { Game } from "../../_shared/game";
import { TypedSocket } from "./socket-io";

export type Cache = {
	matchmaking: {
		connectedUsers: Set<User['id']>;
		queuedPlayers: TypedSocket[];
	},
	activeGames: Map<string, Game>;
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
