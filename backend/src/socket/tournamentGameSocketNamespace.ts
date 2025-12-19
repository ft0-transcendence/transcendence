import { Server } from "socket.io";
import { applySocketAuth } from "../plugins/socketAuthSession";
import { cache } from "../cache";
import { TypedSocket } from "../socket-io";
import { app } from "../../main";
import { GameUserInfo } from "../../shared_exports";
import { OnlineGame } from "../../game/onlineGame";
import { MovePaddleAction } from "../../game/game";

// TODO: FIX THIS STUFF. TournamentGame Never ends

/*
	Check if all these events are handled:
	- player-joined
	- player-left
	- game-aborted
	- player-disconnected
	- disconnection-timer-update
	- player-reconnected
*/
export function setupTournamentGameNamespace(io: Server) {
	const tournamentNamespace = io.of("/tournament-game");
	applySocketAuth(tournamentNamespace);

	tournamentNamespace.on("connection", (socket: TypedSocket) => {
		const { user } = socket.data;
		app.log.debug(`A user connected to the tournament-game namespace: id=${user.id}`);

		socket.on("join-tournament-game", (gameId: string) => {
			(async () => {
				console.log(`Socket ${socket.id} joining tournament game room: ${gameId}`);

				try {
					const game = cache.tournaments.activeTournamentGames.get(gameId);

					if (!game) {
						socket.emit('error', 'Tournament game not found or not active');
						return;
					}

					const isPlayerInGame = game.isPlayerInGame(user.id);

					game.setSocketNamespace(tournamentNamespace);

					// add utente alla partita
					const gameUserInfo: GameUserInfo = {
						id: user.id,
						username: user.username,
						isPlayer: isPlayerInGame
					};

					game.addConnectedUser(gameUserInfo);

					// join alla room della partita
					await socket.join(`${gameId}:${user.id}`);
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

					socket.to(gameId).emit('player-joined-tournament-game', {
						userId: user.id,
						username: user.username
					});

					app.log.info('User %s joined tournament game %s', user.username, gameId);

				} catch (error) {
					app.log.error('Error joining tournament game:', error);
					socket.emit('error', 'Failed to join tournament game');
				}
			})();
		});

		// Tournament game input handlers
		socket.on("player-press", (action: MovePaddleAction) => {
			const rooms = Array.from(socket.rooms);
			const gameId = rooms.find(room => room !== socket.id && room !== `tournament-${user.id}`);

			if (!gameId) {
				socket.emit('error', 'Not in any game room');
				return;
			}

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

			socket.to(gameId).emit("game-state", game.getState());
			socket.emit("game-state", game.getState());
		});

		socket.on("player-release", (action: MovePaddleAction) => {
			const rooms = Array.from(socket.rooms);
			const gameId = rooms.find(room => room !== socket.id && room !== `tournament-${user.id}`);

			if (!gameId) {
				socket.emit('error', 'Not in any game room');
				return;
			}

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

			socket.to(gameId).emit("game-state", game.getState());
			socket.emit("game-state", game.getState());
		});

		const onSocketDisconnect = async (gameId: string) => {
			await socket.leave(gameId);
			app.log.info(`User ${user.username} left tournament game room ${gameId}`);
			socket.to(gameId).emit("player-left", { userId: user.id });

			const game = cache.tournaments.activeTournamentGames.get(gameId);
			if (game && game.isPlayerInGame(user.id)) {
				(game as OnlineGame).markPlayerDisconnected(user.id);
			}
		}

		socket.on("leave-game", (gameId: string)=>{
			onSocketDisconnect(gameId)
		});

		socket.on("disconnect", () => {
			console.log(`Socket ${socket.id} disconnected from tournament-game namespace`);
			const allGames = Array.from(cache.tournaments.activeTournamentGames.values());
			const playerGames = allGames.filter(g => g.isPlayerInGame(user.id));
			for (const game of playerGames) {
				onSocketDisconnect(game.currentGameId);
			}
		});
	});

}
