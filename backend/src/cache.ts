import { Game, PrismaClient, TournamentStatus, TournamentType, User } from "@prisma/client";
import { OnlineGame } from "../game/onlineGame";
import { TournamentGame } from "../game/tournamentGame";
import { TypedSocket } from "./socket-io";
import { FastifyInstance } from "fastify/types/instance";
import { db } from "./trpc/db";
import { app } from "../main";
import { updateGameStats } from "./utils/statsUtils";
import { GameStatus } from "../game/game";
import { AIPlayerService } from "./services/aiPlayerService";


async function handleVSGameFinish(gameId: string, state: GameStatus, gameInstance: OnlineGame, leftPlayerId: string | null, rightPlayerId: string | null) {
	console.log(`🎮 VS Game ${gameId} finishing with scores: ${state.scores.left}-${state.scores.right}, forfeited: ${gameInstance.wasForfeited}`);
	console.log(`🎮 VS Game ${gameId} players: left=${leftPlayerId}, right=${rightPlayerId}`);

	const isAborted = gameInstance.wasForfeited;

	const updateData: Partial<Game> = {
		endDate: new Date(),
		leftPlayerScore: state.scores.left,
		rightPlayerScore: state.scores.right,
	};

	if (isAborted) {
		updateData.abortDate = new Date();
	}

	try {
		await db.game.update({
			where: { id: gameId },
			data: updateData,
		});
		console.log(`✅ VS Game ${gameId} successfully updated in database`);

		// Aggiorna sempre le statistiche dei giocatori
		if (state.scores.left !== state.scores.right && leftPlayerId && rightPlayerId) {
			let winnerId: string;
			let loserId: string;

			if (state.scores.left > state.scores.right) {
				winnerId = leftPlayerId;
				loserId = rightPlayerId;
			} else {
				winnerId = rightPlayerId;
				loserId = leftPlayerId;
			}

			console.log(`📊 VS Game ${gameId}: Updating stats - winner=${winnerId}, loser=${loserId}, forfeited=${isAborted}`);
			await updateGameStats(db, winnerId, loserId);
		} else if (!leftPlayerId || !rightPlayerId) {
			console.log(`⚠️ VS Game ${gameId} has missing player IDs, skipping stats update`);
		} else {
			console.log(`⚠️ VS Game ${gameId} ended in a tie, skipping stats update`);
		}

	} catch (error) {
		console.error(`❌ VS Game ${gameId} failed to update database:`, error);
	}

	cache.active_1v1_games.delete(gameId);
	app.log.info("VS Game #%s persisted and removed from cache.", gameId);
}


export type TournamentCacheEntry = {
	id: string;
	name: string;
	type: TournamentType | null;
	status: TournamentStatus | null;
	participants: Set<User['id']>;
	connectedUsers: Set<User['id']>;
	creatorId: string;
	bracketCreated: boolean;
	lastBracketUpdate: Date;
	participantSlots: Map<number, User['id'] | null>; // Track participant positions in bracket
};

export type Cache = {
	matchmaking: {
		connectedUsers: Set<User['id']>;
		queuedPlayers: TypedSocket[];
	},
	active_1v1_games: Map<string, OnlineGame>;
	onlineUsers: Map<User['id'], TypedSocket>;
	userSockets: Map<User['id'], Set<TypedSocket>>;
	tournaments: {
		active: Map<string, TournamentCacheEntry>;
		activeTournamentGames: Map<string, TournamentGame>;
		tournamentLobbies: Map<string, Set<User['id']>>;
	};
}

export const cache: Cache = {
	matchmaking: {
		connectedUsers: new Set(),
		queuedPlayers: []
	},
	active_1v1_games: new Map(),
	onlineUsers: new Map(),
	userSockets: new Map(),
	tournaments: {
		active: new Map(),
		activeTournamentGames: new Map(),
		tournamentLobbies: new Map()
	}
}


export async function loadActiveGamesIntoCache(db: PrismaClient, fastify: FastifyInstance) {
	app.log.info('Loading active games from database into cache...');

	// Carica partite VS nel DB
	const activeVSGames = await db.game.findMany({
		where: {
			endDate: null,
			type: 'VS',
			tournamentId: null,
		},
		include: { leftPlayer: true, rightPlayer: true },
	});

	for (const game of activeVSGames) {
		// Skip games with missing players (should not happen for VS games, but handle gracefully)
		if (!game.leftPlayer || !game.rightPlayer || !game.leftPlayerId || !game.rightPlayerId) {
			fastify.log.warn('VS Game #%s has missing players, marking as aborted', game.id);
			await db.game.update({
				where: { id: game.id },
				data: {
					endDate: new Date(),
					abortDate: new Date(),
				}
			});
			continue;
		}

		const LEASE_TIME = 1000 * 60; // 1 min

		const now = new Date();
		const limitDate = new Date(game.updatedAt.getTime() + LEASE_TIME);
		if (now > limitDate) {
			fastify.log.warn('VS Game #%s is expired (last updated: %s), removing from cache', game.id, game.updatedAt.toISOString());
			await db.game.update({
				where: { id: game.id },
				data: {
					endDate: new Date(),
					abortDate: new Date(),
				}
			});
			continue;
		}

		const gameInstance = new OnlineGame(
			game.id,
			null,
			{
				maxScore: game.scoreGoal,
				initialData: {
					leftPlayerScore: game.leftPlayerScore,
					rightPlayerScore: game.rightPlayerScore,
				}
			},
			async (state) => {
				await handleVSGameFinish(game.id, state, gameInstance, game.leftPlayerId, game.rightPlayerId);
			},
			async (gameInstance) => {
				await db.game.update({
					where: { id: game.id },
					data: {
						updatedAt: new Date(),
						leftPlayerScore: gameInstance?.scores.left,
						rightPlayerScore: gameInstance?.scores.right
					}
				});
			}
		);
		gameInstance.setPlayers({ ...game.leftPlayer }, { ...game.rightPlayer });
		gameInstance.scores.left = game.leftPlayerScore;
		gameInstance.scores.right = game.rightPlayerScore;

		cache.active_1v1_games.set(game.id, gameInstance);
	}

	// Carica partite TOURNAMENT e AI (per tornei) nel DB
	await db.game.updateMany({
		where: {
			tournamentId: {not: null},
			endDate: null,
		},
		data: {
			updatedAt: new Date(),
		}
	})
	const activeTournamentGames = await db.game.findMany({
		where: {
			endDate: null,
			tournamentId: {not: null},
			OR: [
				{ type: 'TOURNAMENT' },
				{ type: 'AI', tournamentId: { not: null } }
			]
		},
		include: { leftPlayer: true, rightPlayer: true, tournament: true },
	});


	for (const game of activeTournamentGames) {
		if (game.tournament?.status === 'COMPLETED') {
			fastify.log.debug(`Tournament's (#${game.tournamentId}) Game #%s is completed, skipping`, game.id);
			continue;
		}
		const isLeftAI = AIPlayerService.isAIPlayer(game.leftPlayerId, game.leftPlayerUsername);
		const isRightAI = AIPlayerService.isAIPlayer(game.rightPlayerId, game.rightPlayerUsername);

		if (isLeftAI && isRightAI) {

		}


		if (!game.startDate){
			fastify.log.debug(`Tournament's (#${game.tournamentId}) Game #%s has no start date, skipping`, game.id);
			continue;
		}

		// // Skip games with empty slots (they will be created on-demand when needed)
		// if (!game.leftPlayer || !game.rightPlayer) {
		// 	fastify.log.debug(`Tournament's (#${game.tournamentId}) Game #%s has empty slots, skipping (will create on-demand)`, game.id);
		// 	continue;
		// }

		const LEASE_TIME = 1000 * 60; // 1 min

		if (game.tournament?.status === 'IN_PROGRESS') {
			const now = new Date();
			const limitDate = new Date(game.updatedAt.getTime() + LEASE_TIME);
			if (now > limitDate) {
				fastify.log.warn(`Tournament's (#${game.tournamentId}) Game #%s is expired (last updated: %s), removing from cache`, game.id, game.updatedAt.toISOString());
				await db.game.update({
					where: { id: game.id },
					data: {
						endDate: new Date(),
						abortDate: new Date(),
					}
				});
				continue;
			}
		}


		if (!game.tournamentId) {
			fastify.log.warn(`Tournament's (#${game.tournamentId}) Game #%s has no tournamentId, skipping`, game.id);
			continue;
		}

		const gameInstance = new TournamentGame(
			game.id,
			game.tournamentId,
			{
				socketNamespace: null,
				config: {
					maxScore: game.scoreGoal,
					initialData: {
						leftPlayerScore: game.leftPlayerScore,
						rightPlayerScore: game.rightPlayerScore,
					}
				},
				onGameFinish: async (state, tournamentId, gameId) => {
					// Check if game was forfeited due to disconnection
					const isAborted = gameInstance.wasForfeited;

					const updateData: Partial<Game> = {
						endDate: new Date(),
						leftPlayerScore: state.scores.left,
						rightPlayerScore: state.scores.right,
					};

					if (isAborted) {
						updateData.abortDate = new Date();
					}
					await db.game.updateMany({
						where: { id: gameId },
						data: updateData,
					});

					cache.tournaments.activeTournamentGames.delete(gameId);
					fastify.log.info("Tournament (Game #%s persisted and removed from cache.", gameId);
				},
				updateGameActivity: async () => {
					await db.game.updateMany({
						where: { id: game.id, endDate: null },
						data: { updatedAt: new Date() }
					});
				}
			}
		);

		// For AI games, we'll handle AI logic in the TournamentGame itself
		// by checking player types when they join
		const leftPlayer = {
			id: game.leftPlayerId,
			username: game.leftPlayerUsername,
			isPlayer: !isLeftAI
		};
		const rightPlayer = {
			id: game.rightPlayerId,
			username: game.rightPlayerUsername,
			isPlayer: !isRightAI
		}


		gameInstance.setPlayers(leftPlayer, rightPlayer);
		gameInstance.scores.left = game.leftPlayerScore;
		gameInstance.scores.right = game.rightPlayerScore;

		cache.tournaments.activeTournamentGames.set(game.id, gameInstance);
	}

	fastify.log.info(`Loaded [VS: ${activeVSGames.length}] and [Tournament: ${activeTournamentGames.length}] games from database into cache`);
}

export function addUserToOnlineCache(userId: User['id'], socket: TypedSocket) {
	if (!cache.userSockets.has(userId)) {
		cache.userSockets.set(userId, new Set());
	}
	cache.userSockets.get(userId)!.add(socket);

	if (cache.userSockets.get(userId)!.size === 1) {
		cache.onlineUsers.set(userId, socket);
	}
	notifyFriendsUserOnline(userId);
}

export function removeUserFromOnlineCache(userId: User['id'], socket: TypedSocket) {
	const userSockets = cache.userSockets.get(userId);
	if (userSockets) {
		userSockets.delete(socket);

		if (userSockets.size === 0) {
			app.log.debug("User %s fully disconnected, removing from online users cache", userId);
			cache.onlineUsers.delete(userId);
			cache.userSockets.delete(userId);
			notifyFriendsUserOffline(userId);
		}
	}
}

export function isUserOnline(userId: User['id']): boolean {
	return cache.onlineUsers.has(userId);
}

export function addTournamentToCache(tournamentId: string, tournamentInfo: TournamentCacheEntry) {
	cache.tournaments.active.set(tournamentId, tournamentInfo);
}

export function updateTournamentBracket(tournamentId: string, participantSlots: Map<number, User['id'] | null>) {
	const tournament = cache.tournaments.active.get(tournamentId);
	if (tournament) {
		tournament.participantSlots = participantSlots;
		tournament.lastBracketUpdate = new Date();
	}
}



export function removeTournamentFromCache(tournamentId: string) {
	cache.tournaments.active.delete(tournamentId);
	cache.tournaments.tournamentLobbies.delete(tournamentId);

	for (const [gameId, game] of cache.tournaments.activeTournamentGames) {
		if (game instanceof TournamentGame && game.tournamentId === tournamentId) {
			cache.tournaments.activeTournamentGames.delete(gameId);
		}
	}
}

export function addTournamentGameToCache(gameId: string, game: TournamentGame) {
	cache.tournaments.activeTournamentGames.set(gameId, game);
}

export function removeTournamentGameFromCache(gameId: string) {
	cache.tournaments.activeTournamentGames.delete(gameId);
}

export function getOnlineFriends(userId: User['id']): User['id'][] {
	// Questa funzione sarà implementata nel socket handler so x ora array vuoto
	return [];
}

async function notifyFriendsUserOnline(userId: User['id']) {
	try {
		const user = await db.user.findFirst({
			where: { id: userId },
			select: {
				id: true,
				username: true,
				friends: {
					where: {
						state: 'ACCEPTED'
					}
				}
			},
		});

		if (!user) {
			app.log.warn('User %s not found', userId);
			return;
		};

		const friendData = {
			id: user.id,
			username: user.username,
			state: 'online' as const,
			message: `${user.username} is online`
		};

		for (const friend of user.friends) {
			const friendUserId = friend.friendId;
			const friendSockets = cache.userSockets.get(friendUserId);
			if (friendSockets) {
				for (const friendSocket of friendSockets) {
					friendSocket.emit('friend-updated', friendData);
				}
			}
		}

		app.log.debug('Notified %s friends that user %s went online', user.friends.length, userId);
	} catch (error) {
		app.log.error('Error notifying friends of user online:', error);
	}
}

async function notifyFriendsUserOffline(userId: User['id']) {
	try {
		const user = await db.user.findFirst({
			where: { id: userId },
			select: {
				id: true,
				username: true,
				friends: {
					where: {
						state: 'ACCEPTED'
					}
				}
			}
		});

		if (!user) return;

		const friendData = {
			id: user.id,
			username: user.username,
			state: 'offline' as const,
			message: `${user.username} is offline`
		};

		for (const friend of user.friends) {
			const friendUserId = friend.friendId;
			const friendSockets = cache.userSockets.get(friendUserId);
			if (friendSockets) {
				for (const friendSocket of friendSockets) {
					friendSocket.emit('friend-updated', friendData);
				}
			}
		}

		app.log.debug('Notified friends that user %s went offline', userId);
	} catch (error) {
		app.log.error('Error notifying friends of user offline:', error);
	}
}
