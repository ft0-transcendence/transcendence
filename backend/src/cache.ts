import { PrismaClient, User } from "@prisma/client";
import { OnlineGame } from "../game/onlineGame";
import { TypedSocket } from "./socket-io";
import { FastifyInstance } from "fastify/types/instance";
import { db } from "./trpc/db";
import { fastify } from "../main";

export type Cache = {
	matchmaking: {
		connectedUsers: Set<User['id']>;
		queuedPlayers: TypedSocket[];
	},
	active_1v1_games: Map<string, OnlineGame>;
	onlineUsers: Map<User['id'], TypedSocket>;
	userSockets: Map<User['id'], Set<TypedSocket>>;
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
	active_1v1_games: new Map(),
	onlineUsers: new Map(),
	userSockets: new Map()
}


export async function loadActiveGamesIntoCache(db: PrismaClient, fastify: FastifyInstance) {
	const activeGames = await db.game.findMany({
		where: { endDate: null },
		include: { leftPlayer: true, rightPlayer: true },
	});

	for (const game of activeGames) {

		const LEASE_TIME = 1000 * 60; // 1 min

		const now = new Date();
		// Use updatedAt instead of startDate for better tracking of game activity
		const limitDate = new Date(game.updatedAt.getTime() + LEASE_TIME);
		if (now > limitDate) {
			fastify.log.warn('Game %s is expired (last updated: %s), removing from cache', game.id, game.updatedAt.toISOString());
			await db.game.update({
				where: { id: game.id },
				data: {
					endDate: new Date(),
					abortDate: new Date(),
					abortReason: 'Game expired due to inactivity'
				}
			});
			continue;
		}

		const gameInstance = new OnlineGame(
			game.id,
			null, // socketNamespace will be set when needed
			{
				maxScore: game.scoreGoal,
			},
			async (state) => {
				// Check if game was aborted due to disconnection
				const isAborted = state.scores.left === 10 && state.scores.right === 0 ||
					state.scores.left === 0 && state.scores.right === 10;

				const updateData: any = {
					endDate: new Date(),
					leftPlayerScore: state.scores.left,
					rightPlayerScore: state.scores.right,
				};

				// If aborted due to disconnection, add abort information
				if (isAborted) {
					updateData.abortDate = new Date();
					updateData.abortReason = 'Player disconnection timeout';
				}

				await db.game.update({
					where: { id: game.id },
					data: updateData,
				});
				cache.active_1v1_games.delete(game.id);
				fastify.log.info("Game %s persisted and removed from cache.", game.id);
			},
			async () => {
				// Update game activity timestamp
				await db.game.update({
					where: { id: game.id },
					data: { updatedAt: new Date() }
				});
			}
		);
		gameInstance.setPlayers({ ...game.leftPlayer }, { ...game.rightPlayer });
		gameInstance.scores.left = game.leftPlayerScore;
		gameInstance.scores.right = game.rightPlayerScore;

		cache.active_1v1_games.set(game.id, gameInstance);
	}

	fastify.log.info(`Loaded ${activeGames.length} active games into cache`);
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
			fastify.log.debug("User %s fully disconnected, removing from online users cache", userId);
			cache.onlineUsers.delete(userId);
			cache.userSockets.delete(userId);
			notifyFriendsUserOffline(userId);
		}
	}
}

export function isUserOnline(userId: User['id']): boolean {
	return cache.onlineUsers.has(userId);
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
			fastify.log.warn('User %s not found', userId);
			return;
		};

		const friendData = {
			id: user.id,
			username: user.username,
			state: 'online' as const
		};

		for (const friend of user.friends) {
			const friendUserId = friend.friendId;
			const friendSockets = cache.userSockets.get(friendUserId);
			if (friendSockets) {
				for (const friendSocket of friendSockets) {
					friendSocket.emit('friend-updated', friendData);
					friendSocket.emit('notification', {
						type: 'info',
						message: `${user.username} is online`
					});
				}
			}
		}

		fastify.log.debug('Notified %s friends that user %s went online', user.friends.length, userId);
	} catch (error) {
		fastify.log.error('Error notifying friends of user online:', error);
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
			state: 'offline' as const
		};

		for (const friend of user.friends) {
			const friendUserId = friend.friendId;
			const friendSockets = cache.userSockets.get(friendUserId);
			if (friendSockets) {
				for (const friendSocket of friendSockets) {
					friendSocket.emit('friend-updated', friendData);
					friendSocket.emit('notification', {
						type: 'info',
						message: `${user.username} is offline`
					});
				}
			}
		}

		fastify.log.debug('Notified friends that user %s went offline', userId);
	} catch (error) {
		fastify.log.error('Error notifying friends of user offline:', error);
	}
}
