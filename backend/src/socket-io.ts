import { User } from '@prisma/client';

import { DefaultEventsMap, Namespace, Server, Socket } from "socket.io";
import { cache, addUserToOnlineCache, removeUserFromOnlineCache, isUserOnline } from './cache';
import { Game, GameStatus, GameUserInfo, MovePaddleAction } from '../game/game';
import { OnlineGame } from '../game/onlineGame';
import { BracketGenerator } from '../game/bracketGenerator';
import { fastify } from '../main';
import { applySocketAuth } from './plugins/socketAuthSession';
import { db } from './trpc/db';
import { createVsGameRecord, finalizeVsGameResult } from './services/vsGameService';

async function handleVSGameFinish(gameId: string, state: GameStatus, gameInstance: OnlineGame, leftPlayerId: string, rightPlayerId: string) {
	console.log(`🎮 VS Game ${gameId} finishing with scores: ${state.scores.left}-${state.scores.right}, forfeited: ${gameInstance.wasForfeited}`);
	console.log(`🎮 VS Game ${gameId} players: left=${leftPlayerId}, right=${rightPlayerId}`);

	try {
		await finalizeVsGameResult(db, {
			gameId,
			leftPlayerId,
			rightPlayerId,
			scores: state.scores,
			isForfeited: gameInstance.wasForfeited,
			finishedAt: new Date(),
		});
		console.log(`✅ VS Game ${gameId} successfully persisted`);
	} catch (error) {
		console.error(`❌ VS Game ${gameId} failed to finalize:`, error);
	}

	cache.active_1v1_games.delete(gameId);
	fastify.log.info("VS Game %s persisted and removed from cache.", gameId);
}


type SocketData = {
	user: User;
}

export type SocketFriendInfo = {
	id: string;
	username: string;
	state: 'online' | 'offline';
	// lastSeen: Date;
}

// README: if you want to have the custom socket's data type for each listener you have to add the type CustomSocket on the function's parameter
export type TypedSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;
export type TypedSocketNamespace = Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

export function setupSocketHandlers(io: Server) {

	setupMatchmakingNamespace(io);
	setupOnlineVersusGameNamespace(io);
	setupFriendshipNamespace(io);
	setupTournamentNamespace(io);

	fastify.log.info("Setting up Socket.IO handlers");
	io.on("connection", async (socket: TypedSocket) => {
		fastify.log.info("Socket connected. id=%s, username=%s", socket.id, socket.data.user.username);
		addUserToOnlineCache(socket.data.user.id, socket);

		await sendFriendsListToUser(socket.data.user.id, socket);

		socket.on("disconnect", async (reason) => {
			fastify.log.info("Socket disconnected %s", socket.id);
			if (socket.data?.user) {
				removeUserFromOnlineCache(socket.data.user.id, socket);
			}
		});
	});



	io.on("error", (err) => {
		console.error("Socket error", err);
	});
}

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
						fastify.log.warn('Stale active game found in DB. Closing it.', activeGameWithCurrentUser.id);
						await db.game.update({
							where: { id: activeGameWithCurrentUser.id },
							data: { endDate: new Date() },
						});
					} else {
						const opponent = activeGameWithCurrentUser.leftPlayerId === user.id
							? activeGameWithCurrentUser.rightPlayer
							: activeGameWithCurrentUser.leftPlayer;

						const opponentData: GameUserInfo = { id: opponent.id, username: opponent.username, isPlayer: true };

						fastify.log.info('User already in active game, skipping matchmaking', user.username);

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

							fastify.log.info('User already in active cached game, skipping matchmaking', user.username);

							socket.emit('match-found', {
								gameId: gameId,
								opponent: opponentData,
							});
							return;
						}
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
								console.log(`Game ${gameId} not yet in DB, skipping update`);
							}
						}
					);

					newGame.setPlayers(player1Data, player2Data);

					try {
						await createVsGameRecord(db, {
							gameId,
							leftPlayerId: player1Data.id,
							rightPlayerId: player2Data.id,
							leftPlayerUsername: player1Data.username,
							rightPlayerUsername: player2Data.username,
							startDate: new Date(),
						});
					} catch (error) {
						fastify.log.error({ err: error }, 'Failed to create VS game %s in database', gameId);
					}

					cache.active_1v1_games.set(gameId, newGame);

					fastify.log.info('Game %s created in memory and persisted, waiting for players to connect', gameId);
				}
			})();
		});

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
					fastify.log.info('Both players connected to game %s, game ready to start', gameId);
				} else {
					fastify.log.info('Only %d/2 players connected to game %s, starting grace period', playersInRoom, gameId);

					// Start 30-second grace period for the missing player
					setTimeout(() => {
						const currentConnectedPlayers = game.getConnectedPlayers().filter(p => p.isPlayer).length;
						if (currentConnectedPlayers < 2) {
							fastify.log.warn('Grace period expired for game %s, cancelling game', gameId);

							onlineVersusGameNamespace.to(gameId).emit('game-cancelled', {
								reason: 'grace-period-expired',
								message: 'La partita è stata cancellata perché non tutti i giocatori si sono connessi in tempo'
							});

							cache.active_1v1_games.delete(gameId);
						}
					}, 30000);
				}
			}

			// README: do we want to allow spectators?
			// if (!isPlayerInGame) {
			// 	socket.emit('error', 'You are not a player in this game');
			// 	return;
			// }

			// Create and join a "label" (not a real room, just a way to group sockets) to which we can broadcast the game state
			await socket.join(gameId);
			game.playerReady({ id: user.id, username: user.username });
			// After joining, if both players are ready the game may have just started; emit fresh state to this socket too
			socket.emit('game-state', game.getState());
			// If the user is a player and was previously disconnected, mark as reconnected
			if (isPlayerInGame && 'markPlayerReconnected' in game) {
				(game as OnlineGame).markPlayerReconnected(user.id);
			}
			socket.emit('game-state', game.getState());

			fastify.log.debug("Socket joined game. id=%s, gameId=%s. is_a_player=%s", socket.id, gameId, isPlayerInGame);

			// Notify other players in the game
			socket.to(gameId).emit('player-joined', gameUserInfo);

			// socket.emit('player-list', game.getConnectedPlayers());
			// socket.emit('game-state', game.getState());
		});

		socket.on("player-press", (action: MovePaddleAction) => {
			// Get gameId from the socket's rooms
			const rooms = Array.from(socket.rooms);
			const gameId = rooms.find(room => room !== socket.id);

			if (!gameId) {
				socket.emit('error', 'Not in any game room');
				return;
			}

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
			socket.to(gameId).emit("game-state", game.getState());
			socket.emit("game-state", game.getState());
		});

		socket.on("player-release", (action: MovePaddleAction) => {
			const rooms = Array.from(socket.rooms);
			const gameId = rooms.find(room => room !== socket.id);
			if (!gameId) {
				socket.emit('error', 'Not in any game room');
				return;
			}
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
			socket.to(gameId).emit("game-state", game.getState());
			socket.emit("game-state", game.getState());
		});

		socket.on("leave-game", async (gameId: string) => {
			await socket.leave(gameId);
			fastify.log.info(`User ${user.username} left game room ${gameId}`);
			socket.to(gameId).emit("player-left", { userId: user.id });

			const g = cache.active_1v1_games.get(gameId) as OnlineGame | undefined;
			if (g && g.isPlayerInGame(user.id)) {
				// Start grace period instead of finishing immediately
				g.markPlayerDisconnected(user.id);
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

			cache.active_1v1_games.forEach((game, gameId) => {
				const removed = game.removeConnectedUser(userGameInfo);
				if (removed) {
					socket.to(gameId).emit('player-left', userGameInfo);
				}
				if (game.isPlayerInGame(user.id)) {
					(game as OnlineGame).markPlayerDisconnected(user.id);
				}
			});
			// do something with the disconnected user, check if he was in a game and handle that situation.
		});

	});
}

function setupFriendshipNamespace(io: Server) {
	const friendshipNamespace = io.of("/friendship");
	applySocketAuth(friendshipNamespace);

	friendshipNamespace.on("connection", (socket: TypedSocket) => {
		const { user } = socket.data;
		fastify.log.info("Friendship socket connected. id=%s, username=%s", socket.id, user.username);

		socket.on("get-online-friends", async () => {
			try {
				const friends = await db.friend.findMany({
					where: {
						userId: user.id,
						state: 'ACCEPTED'
					},
					include: {
						friend: {
							select: {
								id: true,
								username: true,
							}
						}
					}
				});

				const onlineFriends = friends
					.filter(f => isUserOnline(f.friend.id))
					.map(f => ({
						id: f.friend.id,
						username: f.friend.username,
						isOnline: true
					}));

				socket.emit("online-friends", onlineFriends);
			} catch (error) {
				fastify.log.error("Error getting online friends:", error);
				socket.emit("error", "Error retrieving online friend list");
			}
		});

		socket.on("disconnect", () => {
			fastify.log.info("Friendship socket disconnected %s", socket.id);
		});
	});
}

async function sendFriendsListToUser(userId: User['id'], socket: TypedSocket) {
	try {
		const friendRelations = await db.friend.findMany({
			where: {
				userId: userId, state: 'ACCEPTED',
			},
			include: {
				user: {
					select: {
						id: true,
						username: true,
					}
				},
				friend: {
					select: {
						id: true,
						username: true,
					}
				}
			}
		});

		const friendsList = friendRelations.map(relation => {
			return {
				id: relation.friend.id,
				username: relation.friend.username,
				state: isUserOnline(relation.friend.id) ? 'online' : 'offline'
			};
		});

		socket.emit('friends-list', friendsList);
		fastify.log.debug('Sent friends list to user %s: %d friends', userId, friendsList.length);
	} catch (error) {
		fastify.log.error('Error sending friends list to user %s:', userId, error);
	}
}

function setupTournamentNamespace(io: Server) {
	const tournamentNamespace = io.of("/tournament");
	applySocketAuth(tournamentNamespace);

	tournamentNamespace.on("connection", (socket: TypedSocket) => {
		fastify.log.info("Tournament socket connected. id=%s, username=%s", socket.id, socket.data.user.username);

		const { user } = socket.data;

		socket.on("join-tournament-lobby", async (tournamentId: string) => {
			try {
				const tournament = await db.tournament.findUnique({
					where: { id: tournamentId },
					include: {
						participants: { include: { user: true } },
						games: {
							include: {
								leftPlayer: { select: { id: true, username: true } },
								rightPlayer: { select: { id: true, username: true } }
							}
						}
					}
				});

				if (!tournament) {
					socket.emit('error', 'Tournament not found');
					return;
				}

				// Add user to tournament lobby
				if (!cache.tournaments.tournamentLobbies.has(tournamentId)) {
					cache.tournaments.tournamentLobbies.set(tournamentId, new Set());
				}
				cache.tournaments.tournamentLobbies.get(tournamentId)!.add(user.id);

				// Initialize or update tournament cache with bracket-first approach
				if (!cache.tournaments.active.has(tournamentId)) {
					// Build participant slots from bracket games
					const participantSlots = new Map<number, User['id'] | null>();

					// Initialize 8 slots
					for (let i = 0; i < 8; i++) {
						participantSlots.set(i, null);
					}

					// Find first round games (games that are not referenced by nextGameId)
					const nextGameIds = tournament.games.map(g => g.nextGameId).filter(Boolean);
					const firstRoundGames = tournament.games
						.filter(g => !nextGameIds.includes(g.id))
						.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

					// Fill slots from first round games
					firstRoundGames.forEach((game, index) => {
						if (game.leftPlayerId) {
							participantSlots.set(index * 2, game.leftPlayerId);
						}
						if (game.rightPlayerId) {
							participantSlots.set(index * 2 + 1, game.rightPlayerId);
						}
					});

					cache.tournaments.active.set(tournamentId, {
						id: tournament.id,
						name: tournament.name,
						type: 'EIGHT',
						status: tournament.status as 'WAITING_PLAYERS' | 'IN_PROGRESS' | 'COMPLETED',
						participants: new Set(tournament.participants.map(p => p.userId)),
						connectedUsers: new Set(),
						creatorId: tournament.createdById,
						bracketCreated: tournament.games.length > 0,
						aiPlayers: new Set(),
						lastBracketUpdate: new Date(),
						participantSlots
					});
				}

				const tournamentInfo = cache.tournaments.active.get(tournamentId)!;
				tournamentInfo.connectedUsers.add(user.id);

				await socket.join(tournamentId);

				// Send comprehensive tournament state including bracket info
				socket.emit('tournament-lobby-joined', {
					tournamentId: tournament.id,
					name: tournament.name,
					type: tournament.type || 'EIGHT',
					status: tournament.status,
					creatorId: tournament.createdById,
					isCreator: tournament.createdById === user.id,
					participants: tournament.participants.map(p => ({
						id: p.userId,
						username: p.user.username
					})),
					connectedUsers: Array.from(tournamentInfo.connectedUsers),
					bracketCreated: tournamentInfo.bracketCreated,
					participantSlots: Array.from(tournamentInfo.participantSlots.entries()),
					aiPlayers: Array.from(tournamentInfo.aiPlayers),
					lastBracketUpdate: tournamentInfo.lastBracketUpdate
				});

				// Check if player has an active match ready to play
				if (tournament.status === 'IN_PROGRESS') {
					const playerGames = tournament.games.filter(g =>
						(g.leftPlayerId === user.id || g.rightPlayerId === user.id) &&
						!g.endDate &&
						!g.abortDate
					);

					if (playerGames.length > 0) {
						// Find the next match the player should play
						const nextMatch = playerGames[0];
						const opponentId = nextMatch.leftPlayerId === user.id ? nextMatch.rightPlayerId : nextMatch.leftPlayerId;
						const opponent = tournament.participants.find(p => p.userId === opponentId);

						socket.emit('your-match-ready', {
							tournamentId: tournament.id,
							tournamentName: tournament.name,
							gameId: nextMatch.id,
							round: nextMatch.tournamentRound,
							opponentId: opponentId,
							opponentUsername: opponent?.user.username || 'AI Player',
							message: `Your ${nextMatch.tournamentRound?.toLowerCase() || 'match'} is ready!`
						});
					}
				}

				// Notify other participants about user joining lobby
				socket.to(tournamentId).emit('user-joined-tournament-lobby', {
					userId: user.id,
					username: user.username,
					connectedUsersCount: tournamentInfo.connectedUsers.size
				});

				fastify.log.info('User %s joined tournament lobby %s', user.username, tournament.name);

			} catch (error) {
				fastify.log.error('Error joining tournament lobby:', error);
				socket.emit('error', 'Failed to join tournament lobby');
			}
		});

		///@unused
		socket.on("leave-tournament-lobby", async (tournamentId: string) => {
			try {
				// Remove user from tournament lobby
				const lobby = cache.tournaments.tournamentLobbies.get(tournamentId);
				if (lobby) {
					lobby.delete(user.id);
					if (lobby.size === 0) {
						cache.tournaments.tournamentLobbies.delete(tournamentId);
					}
				}

				// Remove user from tournament cache
				const tournamentInfo = cache.tournaments.active.get(tournamentId);
				if (tournamentInfo) {
					tournamentInfo.connectedUsers.delete(user.id);
				}

				await socket.leave(tournamentId);

				// Notify other participants about user leaving lobby
				socket.to(tournamentId).emit('user-left-tournament-lobby', {
					userId: user.id,
					username: user.username,
					connectedUsersCount: tournamentInfo?.connectedUsers.size || 0
				});

				fastify.log.info('User %s left tournament lobby %s', user.username, tournamentId);

			} catch (error) {
				fastify.log.error('Error leaving tournament lobby:', error);
			}
		});

		// New event for real-time bracket updates
		///TODO: the server should send the bracket update to the client, not the other way around
		socket.on("request-bracket-update", async (tournamentId: string) => {
			try {
				const tournamentInfo = cache.tournaments.active.get(tournamentId);
				if (!tournamentInfo) {
					socket.emit('error', 'Tournament not found in cache');
					return;
				}

				// Send current bracket state
				socket.emit('bracket-updated', {
					tournamentId,
					participantSlots: Array.from(tournamentInfo.participantSlots.entries()),
					aiPlayers: Array.from(tournamentInfo.aiPlayers),
					lastUpdate: tournamentInfo.lastBracketUpdate
				});

			} catch (error) {
				fastify.log.error('Error sending bracket update:', error);
				socket.emit('error', 'Failed to get bracket update');
			}
		});

		// Tournament start is now handled via tRPC with creator control
		// This socket event is kept for real-time notifications only
		socket.on("tournament-start-notification", async (data: { tournamentId: string, startedBy: string }) => {
			try {
				const tournamentInfo = cache.tournaments.active.get(data.tournamentId);
				if (!tournamentInfo) {
					return;
				}

				// Update cache status
				tournamentInfo.status = 'IN_PROGRESS';

				// Broadcast tournament started notification to all lobby participants
				tournamentNamespace.to(data.tournamentId).emit('tournament-started-notification', {
					tournamentId: data.tournamentId,
					startedBy: data.startedBy,
					startDate: new Date(),
					message: `Tournament "${tournamentInfo.name}" has been started by ${data.startedBy}`
				});

				fastify.log.info('Tournament %s start notification broadcasted', data.tournamentId);

			} catch (error) {
				fastify.log.error('Error broadcasting tournament start notification:', error);
			}
		});

		socket.on("disconnect", async (reason) => {
			fastify.log.info("Tournament socket disconnected %s, reason: %s", socket.id, reason);

			// Remove user from all tournament lobbies
			for (const [tournamentId, lobby] of cache.tournaments.tournamentLobbies) {
				if (lobby.has(user.id)) {
					lobby.delete(user.id);
					if (lobby.size === 0) {
						cache.tournaments.tournamentLobbies.delete(tournamentId);
					}

					// Notify remaining users in lobby
					socket.to(tournamentId).emit('user-left-tournament-lobby', {
						userId: user.id,
						username: user.username,
						connectedUsersCount: lobby.size
					});
				}
			}

			// Remove user from all active tournaments
			for (const [tournamentId, tournamentInfo] of cache.tournaments.active) {
				if (tournamentInfo.connectedUsers.has(user.id)) {
					tournamentInfo.connectedUsers.delete(user.id);
				}
			}
		});

		socket.on("join-tournament-game", async (gameId: string) => {
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
				await socket.join(gameId);

				// set giocatore come ready
				game.playerReady(gameUserInfo);

				// If the user is a player and was previously disconnected, mark as reconnected (15s grace period)
				if (isPlayerInGame && 'markPlayerReconnected' in game) {
					(game as OnlineGame).markPlayerReconnected(user.id);
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

				fastify.log.info('User %s joined tournament game %s', user.username, gameId);

			} catch (error) {
				fastify.log.error('Error joining tournament game:', error);
				socket.emit('error', 'Failed to join tournament game');
			}
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

		socket.on("leave-game", async (gameId: string) => {
			await socket.leave(gameId);
			fastify.log.info(`User ${user.username} left tournament game room ${gameId}`);
			socket.to(gameId).emit("player-left", { userId: user.id });

			const game = cache.tournaments.activeTournamentGames.get(gameId);
			if (game && game.isPlayerInGame(user.id)) {
				(game as OnlineGame).markPlayerDisconnected(user.id);
			}
		});

		socket.on("disconnect", () => {
			fastify.log.info("Tournament socket disconnected %s", socket.id);

			const userGameInfo = {
				id: user.id,
				username: user.username,
				isPlayer: false,
			};

			// Handle disconnection for all active tournament games
			cache.tournaments.activeTournamentGames.forEach((game, gameId) => {
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


// Helper functions for tournament notifications
export function broadcastBracketUpdate(tournamentId: string, participantSlots: Map<number, User['id'] | null>, aiPlayers: Set<string>) {
	const io = (global as any).io;
	if (io) {
		const tournamentNamespace = io.of("/tournament");
		tournamentNamespace.to(tournamentId).emit('bracket-updated', {
			tournamentId,
			participantSlots: Array.from(participantSlots.entries()),
			aiPlayers: Array.from(aiPlayers),
			lastUpdate: new Date()
		});
	}
}

export function broadcastParticipantJoined(tournamentId: string, participant: { id: string, username: string }, slotPosition: number) {
	const io = (global as any).io;
	if (io) {
		const tournamentNamespace = io.of("/tournament");
		tournamentNamespace.to(tournamentId).emit('participant-joined-tournament', {
			tournamentId,
			participant,
			slotPosition,
			timestamp: new Date()
		});
	}
}

export function broadcastParticipantLeft(tournamentId: string, participant: { id: string, username: string }, slotPosition: number) {
	const io = (global as any).io;
	if (io) {
		const tournamentNamespace = io.of("/tournament");
		tournamentNamespace.to(tournamentId).emit('participant-left-tournament', {
			tournamentId,
			participant,
			slotPosition,
			timestamp: new Date()
		});
	}
}

export function broadcastTournamentStatusChange(
    tournamentId: string,
    newStatus: string,
    changedBy: string,
    message?: string,
    winner?: { id: string, username: string },
) {
    const io = (global as any).io;
    if (io) {
        const tournamentNamespace = io.of("/tournament");
        const eventData = {
            tournamentId,
            newStatus,
            changedBy,
            message: message || `Tournament status changed to ${newStatus}`,
            timestamp: new Date(),
			winner: winner
        };

        if (newStatus === 'COMPLETED') {
            eventData.winner = winner;
        } else {
			eventData.winner = undefined;
		}

        tournamentNamespace.to(tournamentId).emit('tournament-status-changed', eventData);
    }
}

export function broadcastAIPlayersAdded(tournamentId: string, aiPlayerIds: string[], filledSlots: number[]) {
	const io = (global as any).io;
	if (io) {
		const tournamentNamespace = io.of("/tournament");
		tournamentNamespace.to(tournamentId).emit('ai-players-added', {
			tournamentId,
			aiPlayerIds,
			filledSlots,
			message: `${aiPlayerIds.length} AI players added to fill empty slots`,
			timestamp: new Date()
		});
	}
}

export function broadcastTournamentDeleted(tournamentId: string, tournamentName: string, deletedBy: string) {
	const io = (global as any).io;
	if (io) {
		const tournamentNamespace = io.of("/tournament");
		tournamentNamespace.to(tournamentId).emit('tournament-deleted', {
			tournamentId,
			tournamentName,
			deletedBy,
			message: `Tournament "${tournamentName}" has been deleted by the creator.`,
			timestamp: new Date()
		});
	}
}
