import { Server } from "socket.io";
import { applySocketAuth } from "../plugins/socketAuthSession";
import { cache } from "../cache";
import { TypedSocket } from "../socket-io";
import { app } from "../../main";
import { GameUserInfo } from "../../shared_exports";
import { OnlineGame } from "../../game/onlineGame";
import { MovePaddleAction } from "../../game/game";
import { User } from "@prisma/client";

export function setupTournamentGameNamespace(io: Server) {
	const tournamentGameNamespace = io.of("/tournament-game");
	applySocketAuth(tournamentGameNamespace);

	const getTournamentGameRoomNameForUser = (gameId: string, userId: User['id']) => {
		return `tournament-game:${gameId}:${userId}`;
	}

	tournamentGameNamespace.on("connection", (socket: TypedSocket) => {
		const { user } = socket.data;
		app.log.debug(`A user connected to the tournament-game namespace: id=${user.id}`);

		socket.on("join-tournament-game", (gameId: string) => {
			(async () => {
				app.log.info(`User: ${user.username} (userId[${user.id}]) joining tournament game: ${gameId}`);

				try {
					let game = cache.tournaments.activeTournamentGames.get(gameId);

					if (!game) {
						app.log.warn(`User id[${user.id}] tried to join non-existing tournament game id[${gameId}]. Current active games: ${[...cache.tournaments.activeTournamentGames.keys()]}`);
						socket.emit('error', 'Tournament game not found or not active');
						return;
					}

					const isPlayerInGame = game.isPlayerInGame(user.id);

					game.setSocketNamespace(tournamentGameNamespace);

					// add utente alla partita
					const gameUserInfo: GameUserInfo = {
						id: user.id,
						username: user.username,
						isPlayer: isPlayerInGame
					};

					game.addConnectedUser(gameUserInfo);

					// join alla room della partita
					await socket.join(getTournamentGameRoomNameForUser(gameId, user.id));
					await socket.join(gameId);

					// set giocatore come ready
					game.playerReady(gameUserInfo);

					// If the user is a player and was previously disconnected, mark as reconnected (15s grace period)
					if (isPlayerInGame) {
						game.markPlayerReconnected(user.id);
					}

					socket.emit('tournament-game-joined', {
						gameId: gameId,
						game: {
							leftPlayer: game.leftPlayer,
							rightPlayer: game.rightPlayer,
							state: game.getState()
						},
						playerSide: game.leftPlayer?.id === user.id ? 'left' : 'right',
						isPlayer: isPlayerInGame,
						ableToPlay: isPlayerInGame
					});

					socket.to(getTournamentGameRoomNameForUser(gameId, user.id)).emit('game-state', game.getState());

					socket.to(gameId).emit('player-joined', {
						userId: user.id,
						username: user.username
					});

					app.log.info('✅ User [%s] (userId[%s]) joined tournament game gameId[%s] successfully', user.username, user.id, gameId);

				} catch (error) {
					app.log.error('❌ Error joining tournament game %s: %s', gameId, error);
					socket.emit('error', 'Failed to join tournament game');
				}
			})();
		});

		// Tournament game input handlers
		socket.on("player-press", (input: { direction: MovePaddleAction, gameId: string }) => {
			const gameId = input.gameId;
			const action = input.direction;

			const game = cache.tournaments.activeTournamentGames.get(gameId);
			if (!game) {
				socket.emit('error', 'Tournament game not found');
				return;
			}

			const isPlayerInGame = game.isPlayerInGame(user.id);
			if (!isPlayerInGame) {
				socket.emit('error', 'You are not a player in this game');
				return;
			}

			if (game.leftPlayer?.id === user.id) {
				game.press("left", action);
			} else if (game.rightPlayer?.id === user.id) {
				game.press("right", action);
			}
		});

		socket.on("player-release", (input: { direction: MovePaddleAction, gameId: string }) => {
			const gameId = input.gameId;
			const action = input.direction;

			const game = cache.tournaments.activeTournamentGames.get(gameId);
			if (!game) {
				socket.emit('error', 'Tournament game not found');
				return;
			}

			const isPlayerInGame = game.isPlayerInGame(user.id);
			if (!isPlayerInGame) {
				socket.emit('error', 'You are not a player in this game');
				return;
			}

			if (game.leftPlayer?.id === user.id) {
				game.release("left", action);
			} else if (game.rightPlayer?.id === user.id) {
				game.release("right", action);
			}
		});

		socket.on("disconnect", () => {
			app.log.info("Tournament Game socket disconnected %s", socket.id);
			const userGameInfo = {
				id: user.id,
				username: user.username,
				isPlayer: false,
			}

			cache.tournaments.activeTournamentGames.forEach((game, gameId) => {
				const removed = game.removeConnectedUser(userGameInfo);
				if (removed) {
					socket.to(gameId).emit('player-left', userGameInfo);
				}
				if (game.isPlayerInGame(user.id) && game.getPlayerConnectionCount(user.id) === 0) {
					game.markPlayerDisconnected(user.id);
				}
			});
		});
	});

}
