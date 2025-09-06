import { User, GameType } from '@prisma/client';

import { DefaultEventsMap, Server, Socket } from "socket.io";
import { cache } from './cache';
import { Game, GameUserInfo, MovePaddleAction } from '../game/game';
import { OnlineGame } from '../game/onlineGame';
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
function setupMatchmakingNamespace(io: Server) {
	const matchmakingNamespace = io.of("/matchmaking");
	const onlineVersusGameNamespace = io.of("/vs-game");
	applySocketAuth(matchmakingNamespace);

	matchmakingNamespace.on("connection", (socket: TypedSocket) => {

		const { user } = socket.data;

		socket.on("leave-matchmaking", () => {
			fastify.log.info('Matchmaking socket left matchmaking. id=%s, username=%s', socket.id, user.username);
			cache.matchmaking.connectedUsers.delete(user.id);
			cache.matchmaking.queuedPlayers = cache.matchmaking.queuedPlayers.filter(s => s.id !== socket.id);
		});

		socket.on("disconnect", (reason) => {
			cache.matchmaking.connectedUsers.delete(user.id);

			fastify.log.info('Matchmaking socket disconnected, user disconnected. id=%s, username=%s, reason=%s', socket.id, socket.data.user.username, reason);
			cache.matchmaking.queuedPlayers = cache.matchmaking.queuedPlayers.filter(s => s.id !== socket.id);
		});

		const userInCache = cache.matchmaking.connectedUsers.has(user.id);
		if (userInCache) {
			console.warn('User already in matchmaking cache, ignoring connection');
			socket.emit('error', 'You can only join one matchmaking queue at a time');
			return;
		}

		fastify.log.info("Matchmaking socket connected %s, username=%s", socket.id, user.username);
		cache.matchmaking.connectedUsers.add(user.id);

		socket.on("join-matchmaking", () => {
			// Wrapping async is necessary because ^ the second parameter of `join-matchmaking` can take only a synchronous function, and here i need to use async/await
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
					// se NON è in cache, è stale → chiudi e continua con nuovo matchmaking
					if (!cache.activeGames.has(activeGameWithCurrentUser.id)) {
						fastify.log.warn('Stale active game found in DB. Closing it.', activeGameWithCurrentUser.id);
						await db.game.update({
							where: { id: activeGameWithCurrentUser.id },
							data: { endDate: new Date() },
						});
					} else {
						// partita davvero attiva → riusala
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

					const player1Data: GameUserInfo = { id: player1.data.user.id, username: player1.data.user.username, isPlayer: true };
					const player2Data: GameUserInfo = { id: player2.data.user.id, username: player2.data.user.username, isPlayer: true };

					player1.emit('match-found', { gameId, opponent: player2Data });
					player2.emit('match-found', { gameId, opponent: player1Data });

					const newGame = new OnlineGame(
						gameId,
						onlineVersusGameNamespace,
						undefined,
						async (state) => {
							await db.game.update({
								where: { id: gameId },
								data: {
									endDate: new Date(),
									leftPlayerScore: state.scores.left,
									rightPlayerScore: state.scores.right,
								},
							});
							cache.activeGames.delete(gameId);
							fastify.log.info("Game %s persisted and removed from cache.", gameId);
						}
					);

					const game = await db.game.create({
						data: {
							id: gameId,
							startDate: new Date(),
							type: GameType.VS,
							leftPlayerId: player1.data.user.id,
							rightPlayerId: player2.data.user.id,
							scoreGoal: newGame.currentConfig.maxScore,
						},
						include: { leftPlayer: true, rightPlayer: true },
					});

					newGame.setPlayers(player1Data, player2Data);

					cache.activeGames.set(gameId, newGame);
				}
			})();
		});

	});
}

export function setupSocketHandlers(io: Server) {

	setupMatchmakingNamespace(io);
	setupOnlineVersusGameNamespace(io);


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

function setupOnlineVersusGameNamespace(io: Server) {
	const onlineVersusGameNamespace = io.of("/vs-game");
	applySocketAuth(onlineVersusGameNamespace);

	onlineVersusGameNamespace.on("connection", (socket: TypedSocket) => {
		fastify.log.info("Online Versus Game socket connected. id=%s, username=%s", socket.id, socket.data.user.username);


		const { user } = socket.data;

		socket.on("join-game", async (gameId: string) => {
			// maybe add to the game (OnlineGame class) the instance of this socket namespace, so it can call the socket to emit the game's state.
			const game = cache.activeGames.get(gameId);

			let gameUserInfo: GameUserInfo = {
				id: user.id,
				username: user.username,
				isPlayer: false,
			}
			if (!game) {
				socket.emit('error', 'Game not found');
				return;
			}
			const isPlayerInGame = game.isPlayerInGame(user.id);
			gameUserInfo.isPlayer = isPlayerInGame;

			// Set the socket namespace for the game if it's not already set
			game.setSocketNamespace(onlineVersusGameNamespace);

			game.addConnectedUser(gameUserInfo);
			socket.emit('game-found', {
				connectedUsers: game.getConnectedPlayers(),
				ableToPlay: isPlayerInGame,

				leftPlayer: game.leftPlayer,
				rightPlayer: game.rightPlayer,

				state: game.getState(),
			});

			// README: do we want to allow spectators?
			// if (!isPlayerInGame) {
			// 	socket.emit('error', 'You are not a player in this game');
			// 	return;
			// }

			// Create and join a "label" (not a real room, just a way to group sockets) to which we can broadcast the game state
			await socket.join(gameId);
			game.playerReady({ id: user.id, username: user.username });
			socket.emit('game-state', game.getState());

			fastify.log.debug("Socket joined game. id=%s, gameId=%s. is_a_player=%s", socket.id, gameId, isPlayerInGame);

			// Notify other players in the game
			socket.to(gameId).emit('player-joined', gameUserInfo);

			// socket.emit('player-list', game.getConnectedPlayers());
			// socket.emit('game-state', game.getState());
		});

		socket.on("player-action", (action: MovePaddleAction) => {
			// Get gameId from the socket's rooms
			const rooms = Array.from(socket.rooms);
			const gameId = rooms.find(room => room !== socket.id);

			if (!gameId) {
				socket.emit('error', 'Not in any game room');
				return;
			}

			const game = cache.activeGames.get(gameId);
			if (!game) {
				socket.emit('error', 'Game not found');
				return;
			}

			const isPlayerInGame = game.isPlayerInGame(user.id);

			if (!isPlayerInGame) {
				socket.emit('error', 'You are not a player in this game');
				return;
			}

			game.movePlayerPaddle(user.id, action);

			socket.to(gameId).emit("game-state", game.getState());
		});

		socket.on("leave-game", async (gameId: string) => {
			await socket.leave(gameId);
			fastify.log.info(`User ${user.username} left game room ${gameId}`);
			socket.to(gameId).emit("player-left", { userId: user.id });

			const room = onlineVersusGameNamespace.adapter.rooms.get(gameId);
			const remaining = room ? room.size : 0;

			const g = cache.activeGames.get(gameId) as OnlineGame | undefined;
			if (g && remaining <= 1) {
				await g.finish();
			}
		});

		socket.on("disconnect", () => {
			fastify.log.info("Online Versus Game socket disconnected %s", socket.id);
			// iterate for each game and remove the user from the connected users list
			const userGameInfo = {
				id: user.id,
				username: user.username,
				isPlayer: false,
			}

			cache.activeGames.forEach((game, gameId) => {
				const removed = game.removeConnectedUser(userGameInfo);
				if (removed) {
					socket.to(gameId).emit('player-left', userGameInfo);
				}
			});
			// do something with the disconnected user, check if he was in a game and handle that situation.
		});

	});
}
