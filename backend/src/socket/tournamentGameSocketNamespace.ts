import { Server } from "socket.io";
import { applySocketAuth } from "../plugins/socketAuthSession";
import { cache } from "../cache";
import { TypedSocket } from "../socket-io";
import { app } from "../../main";
import { GameUserInfo } from "../../shared_exports";
import { OnlineGame } from "../../game/onlineGame";
import { MovePaddleAction } from "../../game/game";
import { db } from "../trpc/db";
import { createGameInstanceIfNeeded } from "../trpc/routes/tournament";
import { User } from "@prisma/client";

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
	const tournamentGameNamespace = io.of("/tournament-game");
	applySocketAuth(tournamentGameNamespace);

	const getTournamentGameRoomName = (gameId: string, userId?: User['id']) => {
		if (!userId) return `tournament-game:${gameId}`;
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
						app.log.warn(`User id[${user.id}] tried to join non-existing tournament game id[${gameId}].`);
						socket.emit('error', 'Tournament game not found or not active');
						return;
					}
					const tournamentId = game.tournamentId;

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
					await socket.join(getTournamentGameRoomName(gameId, user.id));
					await socket.join(getTournamentGameRoomName(gameId));

					// set giocatore come ready
					game.playerReady(gameUserInfo);

					// If the user is a player and was previously disconnected, mark as reconnected (15s grace period)
					if (isPlayerInGame) {
						game.markPlayerReconnected(user.id);
					}

					// socket.emit('tournament-game-joined', {
					// 	gameId: gameId,
					// 	game: {
					// 		leftPlayer: game.leftPlayer,
					// 		rightPlayer: game.rightPlayer,
					// 		state: game.getState()
					// 	},
					// 	playerSide: game.leftPlayer?.id === user.id ? 'left' : 'right',
					// 	isPlayer: isPlayerInGame,
					// 	ableToPlay: isPlayerInGame
					// });

					socket.to(getTournamentGameRoomName(gameId)).emit('player-joined', {
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

			// socket.to(getTournamentGameRoom(gameId)).emit("game-state", game.getState());
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

			// socket.to(getTournamentGameRoom(gameId)).emit("game-state", game.getState());
		});

		const onSocketDisconnect = async (gameId: string) => {
			await socket.leave(gameId);
			app.log.info(`User ${user.username} left tournament game room ${gameId}`);
			socket.to(getTournamentGameRoomName(gameId)).emit("player-left", { userId: user.id });

			const game = cache.tournaments.activeTournamentGames.get(gameId);
			if (game && game.isPlayerInGame(user.id)) {
				(game as OnlineGame).markPlayerDisconnected(user.id);
			}
		}

		socket.on("leave-game", (gameId: string)=>{
			onSocketDisconnect(gameId)
		});

		socket.on("disconnect", () => {
			app.log.info(`Socket ${socket.id} disconnected from tournament-game namespace`);
			const allGames = Array.from(cache.tournaments.activeTournamentGames.values());
			const playerGames = allGames.filter(g => g.isPlayerInGame(user.id));
			for (const game of playerGames) {
				onSocketDisconnect(game.currentGameId);
			}
		});
	});

}
