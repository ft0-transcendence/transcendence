import { Server } from "socket.io";
import { applySocketAuth } from "../plugins/socketAuthSession";
import { TypedSocket } from "../socket-io";
import { app } from "../../main";
import { cache } from '../cache';
import { GameUserInfo } from "../../shared_exports";
import { OnlineGame } from "../../game/onlineGame";
import { MovePaddleAction } from "../../game/game";
import { User } from "@prisma/client";


export function setupOnlineVersusGameNamespace(io: Server) {
	const onlineVersusGameNamespace = io.of("/vs-game");
	applySocketAuth(onlineVersusGameNamespace);

	const getOnlineVersusGameRoomNameForUser = (gameId: string, userId: User['id']) => {
		return `vs-game:${gameId}:${userId}`;
	}

	onlineVersusGameNamespace.on("connection", (socket: TypedSocket) => {
		app.log.info("Online Versus Game socket connected. id=%s, username=%s", socket.id, socket.data.user.username);


		const { user } = socket.data;

		socket.on("join-game", async (gameId: string) => {
			// maybe add to the game (OnlineGame class) the instance of this socket namespace, so it can call the socket to emit the game's state.
			const game = cache.active_1v1_games.get(gameId);

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

			game.setSocketNamespace(onlineVersusGameNamespace);

			game.addConnectedUser(gameUserInfo);
			socket.emit('game-found', {
				connectedUsers: game.getConnectedPlayers(),
				ableToPlay: isPlayerInGame,

				leftPlayer: game.leftPlayer,
				rightPlayer: game.rightPlayer,

				state: game.getState(),
			});

			// Check if both players are now connected after this join
			if (isPlayerInGame) {
				const connectedPlayers = game.getConnectedPlayers();
				const playersInRoom = connectedPlayers.filter(p => p.isPlayer).length;

				if (playersInRoom === 2) {
					app.log.info('Both players connected to game %s, game ready to start', gameId);
				} else {
					app.log.info('Only %d/2 players connected to game %s, starting grace period', playersInRoom, gameId);

					// Start 30-second grace period for the missing player
					setTimeout(() => {
						const currentConnectedPlayers = game.getConnectedPlayers().filter(p => p.isPlayer).length;
						if (currentConnectedPlayers < 2) {
							app.log.warn('Grace period expired for game %s, cancelling game', gameId);

							onlineVersusGameNamespace.to(gameId).emit('game-cancelled', {
								reason: 'grace-period-expired',
								message: 'La partita è stata cancellata perché non tutti i giocatori si sono connessi in tempo'
							});

							cache.active_1v1_games.delete(gameId);
						}
					}, 30000);
				}
			}

			// README: do we want to allow spectators? If so, uncomment the following if statement
			// if (!isPlayerInGame) {
			// 	socket.emit('error', 'You are not a player in this game');
			// 	return;
			// }

			// Create and join a "label" (not a real room, just a way to group sockets) to which we can broadcast the game state
			await socket.join(gameId);
			await socket.join(getOnlineVersusGameRoomNameForUser(gameId, user.id));
			game.playerReady({ id: user.id, username: user.username });
			// After joining, if both players are ready the game may have just started; emit fresh state to this socket too
			socket.emit('game-state', game.getState());
			// If the user is a player and was previously disconnected, mark as reconnected
			if (isPlayerInGame && 'markPlayerReconnected' in game) {
				(game as OnlineGame).markPlayerReconnected(user.id);
			}
			socket.emit('game-state', game.getState());

			app.log.debug("Socket joined game. id=%s, gameId=%s. is_a_player=%s", socket.id, gameId, isPlayerInGame);

			// Notify other players in the game
			socket.to(gameId).emit('player-joined', gameUserInfo);
		});

		socket.on("player-press", (input: { direction: MovePaddleAction, gameId: string }) => {
			// Get gameId from the socket's rooms
			const gameId = input.gameId;
			const action = input.direction;

			const game = cache.active_1v1_games.get(gameId);
			if (!game) {
				socket.emit('error', 'Game not found');
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

			const game = cache.active_1v1_games.get(gameId);
			if (!game) {
				socket.emit('error', 'Game not found');
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
			app.log.info("Online Versus Game socket disconnected %s", socket.id);
			// iterate for each game and remove the user from the connected users list
			const userGameInfo = {
				id: user.id,
				username: user.username,
				isPlayer: false,
			}

			cache.active_1v1_games.forEach((game, gameId) => {
				const removed = game.removeConnectedUser(userGameInfo);
				if (removed) {
					socket.to(gameId).emit('player-left', userGameInfo);
				}
				if (game.isPlayerInGame(user.id)) {
					(game as OnlineGame).markPlayerDisconnected(user.id);
				}
			});
		});

	});
}
