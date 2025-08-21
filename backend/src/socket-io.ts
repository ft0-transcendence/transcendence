import { User } from '@prisma/client';

import { DefaultEventsMap, Server, Socket } from "socket.io";
import { cache } from './cache';
import { Game } from '../../_shared/game';
import { fastify } from '../main';
import { applySocketAuth } from './plugins/socketAuthSession';
import { db } from './trpc/db';

type SocketData = {
	user: User;
}
// README: if you want to have the custom socket's data type for each listener you have to add the type CustomSocket on the function's parameter
export type TypedSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

/**
 * By default all socket connections are those of a logged in user, because there is a `socketAuthSessionPlugin` middleware that forces the socket to be authenticated.
 * This function sets up the Socket.IO server to listen for new connections and events.
 * @param io Socket.IO server instance
 */
export function setupSocketHandlers(io: Server) {

	setupMatchmakingNamespace(io);



	fastify.log.info("Setting up Socket.IO handlers");
	io.on("connection", (socket: TypedSocket) => {
		fastify.log.info("Socket connected. id=%s, username=%s", socket.id, socket.data.user.username);
	});

	io.on("disconnect", (socket) => {
		fastify.log.info("Socket disconnected %s", socket.id);
	});

	io.on("error", (err) => {
		console.error("Socket error", err);
	});
}


function setupMatchmakingNamespace(io: Server) {
	const matchmakingNamespace = io.of("/matchmaking");
	applySocketAuth(matchmakingNamespace);


	matchmakingNamespace.on("connection", (socket: TypedSocket) => {

		const { user } = socket.data;
		// TODO uncomment this
		// const userInCache = cache.matchmaking.connectedUsers.has(user.id);
		// if (userInCache) {
		// 	console.warn('User already in matchmaking cache, ignoring connection');
		// 	socket.emit('error', 'User already in matchmaking cache');
		// 	socket.disconnect();
		// 	return;
		// }

		fastify.log.info("Matchmaking socket connected %s, username=%s", socket.id, user.username);
		cache.matchmaking.connectedUsers.add(user.id);

		socket.on("join-matchmaking", () => {
			(async () => {
				const activeGameWithCurrentUser = await db.game.findFirst({
					where: {
						endDate: null,
						OR: [
							{ leftPlayerId: user.id },
							{ rightPlayerId: user.id },
						],
					},
					include: { leftPlayer: true, rightPlayer: true },
				});

				if (activeGameWithCurrentUser) {
					const opponent = activeGameWithCurrentUser.leftPlayerId === user.id
						? activeGameWithCurrentUser.rightPlayer
						: activeGameWithCurrentUser.leftPlayer;

					fastify.log.info('User already in active game, skipping matchmaking', user.username);

					socket.emit('match-found', {
						gameId: activeGameWithCurrentUser.id,
						opponent: opponent,
					});
					return;
				}

				fastify.log.info('Matchmaking socket joined matchmaking. id=%s, username=%s', socket.id, user.username);

				const currentQueueLength = cache.matchmaking.queuedPlayers.length;
				if (currentQueueLength == 0) {
					fastify.log.info('Matchmaking queue is empty, adding player to queue');
					cache.matchmaking.queuedPlayers.push(socket);
				} else {
					const player1 = cache.matchmaking.queuedPlayers.pop()!;
					const player2 = socket;

					const gameId = crypto.randomUUID();
					fastify.log.info('Matchmaking two players, id1=%s, id2=%s, gameId=%s', player1.id, player2.id, gameId);

					player1.emit('match-found', { gameId, opponent: player2.data.user });
					player2.emit('match-found', { gameId, opponent: player1.data.user });

					const newGame = new Game();


					const game = await db.game.create({
						data: {
							startDate: new Date(),
							type: 'VS',
							leftPlayerId: player1.data.user.id,
							rightPlayerId: player2.data.user.id,
							scoreGoal: newGame.currentConfig.maxScore,
						},
						include: { leftPlayer: true, rightPlayer: true },
					});

					newGame.setPlayers(player1.data.user, player2.data.user);

					cache.activeGames.set(gameId, newGame);
				}
			})();
		});

		socket.on("disconnect", (reason) => {
			cache.matchmaking.connectedUsers.delete(socket.data.user.id);
			fastify.log.info('Matchmaking socket disconnected, user disconnected. id=%s, username=%s, reason=%s', socket.id, socket.data.user.username, reason);
			cache.matchmaking.queuedPlayers = cache.matchmaking.queuedPlayers.filter(s => s.id !== socket.id);
		});
	});

}
