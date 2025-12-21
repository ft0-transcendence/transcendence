import { Server } from "socket.io";
import { OnlineGame } from "../../game/onlineGame";
import { app } from "../../main";
import { cache } from "../cache";
import { applySocketAuth } from "../plugins/socketAuthSession";
import { TypedSocket } from "../socket-io";
import { db } from "../trpc/db";
import { GameUserInfo } from "../../shared_exports";
import { GameType, Game as PrismaGame } from '@prisma/client';
import { finalizeVsGameResult } from "../services/vsGameService";
import { GameStatus } from "../../game/game";
import { STANDARD_GAME_CONFIG } from "../../constants";

export function setupMatchmakingNamespace(io: Server) {
	const matchmakingNamespace = io.of("/matchmaking");
	const onlineVersusGameNamespace = io.of("/vs-game");
	applySocketAuth(matchmakingNamespace);
	applySocketAuth(onlineVersusGameNamespace);

	matchmakingNamespace.on("connection", (socket: TypedSocket) => {

		const { user } = socket.data;

		socket.on("leave-matchmaking", () => {
			app.log.info('Matchmaking socket left matchmaking. id=%s, username=%s', socket.id, user.username);
			cache.matchmaking.connectedUsers.delete(user.id);
			cache.matchmaking.queuedPlayers = cache.matchmaking.queuedPlayers.filter(s => s.id !== socket.id);
		});

		socket.on("disconnect", (reason) => {
			cache.matchmaking.connectedUsers.delete(user.id);

			app.log.info('Matchmaking socket disconnected, user disconnected. id=%s, username=%s, reason=%s', socket.id, socket.data.user.username, reason);
			cache.matchmaking.queuedPlayers = cache.matchmaking.queuedPlayers.filter(s => s.id !== socket.id);
		});

		const userInCache = cache.matchmaking.connectedUsers.has(user.id);
		if (userInCache) {
			app.log.warn('User already in matchmaking cache, ignoring connection');
			socket.emit('error', 'You can only join one matchmaking queue at a time');
			return;
		}

		app.log.info("Matchmaking socket connected %s, username=%s", socket.id, user.username);
		cache.matchmaking.connectedUsers.add(user.id);

		socket.on("join-matchmaking", () => {
			// Wrapping async is necessary because ^ the second parameter of `join-matchmaking` can take only a synchronous function, and here i need to use async/await
			(async () => {
				// Check for active games in database
				const activeGameWithCurrentUser = await db.game.findFirst({
					where: {
						endDate: null,
						OR: [
							{ leftPlayerId: user.id },
							{ rightPlayerId: user.id },
						],
					},
					include: { leftPlayer: { select: { id: true, username: true } }, rightPlayer: { select: { id: true, username: true } } },
				});

				if (activeGameWithCurrentUser) {
					// se NON è in cache, è stale → chiudi e continua con nuovo matchmaking
					if (!cache.active_1v1_games.has(activeGameWithCurrentUser.id)) {
						app.log.warn('Stale active game found in DB. Closing it.', activeGameWithCurrentUser.id);
						await db.game.update({
							where: { id: activeGameWithCurrentUser.id },
							data: { endDate: new Date() },
						});
					} else {
						const opponent = activeGameWithCurrentUser.leftPlayerId === user.id
							? activeGameWithCurrentUser.rightPlayer
							: activeGameWithCurrentUser.leftPlayer;

						if (!opponent) {
							app.log.warn('Active game has no opponent, skipping');
							return;
						}

						const opponentData: GameUserInfo = { id: opponent.id, username: opponent.username, isPlayer: true };

						app.log.info('User already in active game, skipping matchmaking', user.username);

						socket.emit('match-found', {
							gameId: activeGameWithCurrentUser.id,
							opponent: opponentData,
							alreadyStarted: true,
						});
						return;
					}
				}

				// Also check for games in cache that might not be in DB yet (pending DB creation)
				for (const [gameId, game] of cache.active_1v1_games) {
					if (game.isPlayerInGame(user.id)) {
						const opponent = game.leftPlayer?.id === user.id ? game.rightPlayer : game.leftPlayer;

						if (opponent) {
							const opponentData: GameUserInfo = { id: opponent.id, username: opponent.username, isPlayer: true };

							app.log.info('User already in active cached game, skipping matchmaking', user.username);

							socket.emit('match-found', {
								gameId: gameId,
								opponent: opponentData,
							});
							return;
						}
					}
				}

				app.log.info('Matchmaking socket joined matchmaking. id=%s, username=%s', socket.id, user.username);

				const currentQueueLength = cache.matchmaking.queuedPlayers.length;
				if (currentQueueLength == 0) {
					app.log.info('Matchmaking queue is empty, adding player to queue');
					cache.matchmaking.queuedPlayers.push(socket);
				} else {
					const player1 = cache.matchmaking.queuedPlayers.pop()!;
					const player2 = socket;


					const player1Data: GameUserInfo = { id: player1.data.user.id, username: player1.data.user.username, isPlayer: true };
					const player2Data: GameUserInfo = { id: player2.data.user.id, username: player2.data.user.username, isPlayer: true };

					let game: PrismaGame | null = null;
					let gameId: string | null = null;

					try {
						game = await db.game.create({
								data: {
									type: GameType.VS,
									startDate: new Date(),
									scoreGoal: STANDARD_GAME_CONFIG.maxScore!,
									leftPlayerId: player1Data.id,
									rightPlayerId: player2Data.id,
									leftPlayerUsername: player1Data.username,
									rightPlayerUsername: player2Data.username,
								},
							});
						gameId = game!.id;

					} catch (error) {
						app.log.error({ err: error }, 'Failed to create VS game %s in database', gameId);
						player1.emit('error', 'Failed to create VS game. Please try again later.');
						player2.emit('error', 'Failed to create VS game. Please try again later.');
						return;
					}

					app.log.info('Matchmaking two players, id1=%s, id2=%s, gameId=%s', player1.id, player2.id, gameId);

					player1.emit('match-found', { gameId, opponent: player2Data });
					player2.emit('match-found', { gameId, opponent: player1Data });

					// Create game instance but don't save to DB yet
					const newGame = new OnlineGame(
						gameId,
						onlineVersusGameNamespace,
						{ debug: false },
						async (state) => {
							await handleVSGameFinish(gameId, state, newGame, player1Data.id, player2Data.id);
						},
						async (gameInstance) => {
							try {
								await db.game.update({
									where: { id: gameId },
									data: {
										updatedAt: new Date(),
										leftPlayerScore: gameInstance?.scores.left,
										rightPlayerScore: gameInstance?.scores.right
									}
								});
							} catch (error) {
								app.log.warn(`Game ${gameId} not yet in DB, skipping update`);
							}
						}
					);

					newGame.setPlayers(player1Data, player2Data);


					cache.active_1v1_games.set(gameId, newGame);

					app.log.info('Game %s created in memory and persisted, waiting for players to connect', gameId);
				}
			})();
		});

	});
}



export async function handleVSGameFinish(gameId: string, state: GameStatus, gameInstance: OnlineGame, leftPlayerId: PrismaGame['leftPlayerId'], rightPlayerId: PrismaGame['rightPlayerId']) {
	app.log.debug(`🎮 VS Game ${gameId} finishing with scores: ${state.scores.left}-${state.scores.right}, forfeited: ${gameInstance.wasForfeited}`);
	app.log.debug(`🎮 VS Game ${gameId} players: left=${leftPlayerId}, right=${rightPlayerId}`);

	try {
		await finalizeVsGameResult(db, {
			gameId,
			leftPlayerId,
			rightPlayerId,
			scores: state.scores,
			isForfeited: gameInstance.wasForfeited,
			finishedAt: new Date(),
		});
		app.log.debug(`✅ VS Game ${gameId} successfully persisted`);
	} catch (error) {
		app.log.error(`❌ VS Game ${gameId} failed to finalize: %s`, error);
	}

	cache.active_1v1_games.delete(gameId);
	app.log.info("VS Game %s persisted and removed from cache.", gameId);
}
