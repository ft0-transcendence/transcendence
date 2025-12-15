import { Server } from "socket.io";
import { applySocketAuth } from "../plugins/socketAuthSession";
import { TypedSocket, TypedSocketNamespace } from "../socket-io";
import { app } from "../../main";
import { db } from "../trpc/db";
import { cache } from "../cache";
import { User } from "@prisma/client";
import { GameUserInfo } from "../../shared_exports";
import { OnlineGame } from "../../game/onlineGame";
import { MovePaddleAction } from "../../game/game";
import { craftTournamentDetailsForUser, getTournamentFullDetailsById } from "../trpc/routes/tournament";

const notifyIntervalMs = 1000 * 10;
let notifyInterval: NodeJS.Timeout | null = null;

export function setupTournamentNamespace(io: Server) {
	const tournamentNamespace = io.of("/tournament");
	applySocketAuth(tournamentNamespace);

	tournamentNamespace.on("connection", (socket: TypedSocket) => {
		app.log.info("Tournament socket connected. id=%s, username=%s", socket.id, socket.data.user.username);

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
						.sort((a, b) => (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0));

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
						lastBracketUpdate: new Date(),
						participantSlots
					});
				}

				const tournamentInfo = cache.tournaments.active.get(tournamentId)!;
				tournamentInfo.connectedUsers.add(user.id);

				await socket.join(`${tournamentId}:${user.id}`);
				await socket.join(tournamentId);

				// Send comprehensive tournament state including bracket info
				await tournamentSendBracketUpdateForUser(tournamentId, user.id);

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
							opponentUsername: opponent?.user?.username || null,
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

				app.log.info('User %s joined tournament lobby %s', user.username, tournament.name);

			} catch (error) {
				app.log.error('Error joining tournament lobby:', error);
				socket.emit('error', 'Failed to join tournament lobby');
			}
		});

		socket.on("disconnect", async (reason) => {
			app.log.info("Tournament socket disconnected %s, reason: %s", socket.id, reason);

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
				await socket.join(`${gameId}:${user.id}`);
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

				app.log.info('User %s joined tournament game %s', user.username, gameId);

			} catch (error) {
				app.log.error('Error joining tournament game:', error);
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
			app.log.info(`User ${user.username} left tournament game room ${gameId}`);
			socket.to(gameId).emit("player-left", { userId: user.id });

			const game = cache.tournaments.activeTournamentGames.get(gameId);
			if (game && game.isPlayerInGame(user.id)) {
				(game as OnlineGame).markPlayerDisconnected(user.id);
			}
		});

		socket.on("disconnect", () => {
			app.log.info("Tournament socket disconnected %s", socket.id);

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

	// Not actually needed, because at each bracket update the lobby should be programmatically notified already
	// notifyInterval = setInterval(()=>{
	// 	const tournamentIds = Array.from(cache.tournaments.tournamentLobbies.keys());
	// 	for (const tournamentId of tournamentIds) {
	// 		tournamentBroadcastBracketUpdateById(tournamentId);
	// 	}
	// }, notifyIntervalMs);
}



// Helper functions for tournament notifications
export async function tournamentBroadcastBracketUpdate(tournamentId: string, participantSlots: Map<number, User['id'] | null>, aiPlayers: Set<string>) {
	const tournamentSocket = app.io.of("/tournament");
	const tournamentData = await getTournamentFullDetailsById(tournamentId, false);
	for (const [slotIndex, playerId] of participantSlots.entries()) {
		if (!playerId) continue;
		await sendBracketUpdateToUser(tournamentSocket, tournamentId, playerId, tournamentData);
	}
}
export async function tournamentBroadcastBracketUpdateById(tournamentId: string) {
	const tournamentSocket = app.io.of("/tournament");
	const users = cache.tournaments.tournamentLobbies.get(tournamentId);
	if (!users) return;

	const tournamentData = await getTournamentFullDetailsById(tournamentId, false);
	for (const playerId of users) {
		await sendBracketUpdateToUser(tournamentSocket, tournamentId, playerId, tournamentData);
	}
}


export async function tournamentSendBracketUpdateForUser(tournamentId: string, playerId: User['id']) {
	const tournamentSocket = app.io.of("/tournament");
	const users = cache.tournaments.tournamentLobbies.get(tournamentId);
	if (!users || !users.has(playerId)) return;

	const tournamentData = await getTournamentFullDetailsById(tournamentId, false);

	await sendBracketUpdateToUser(tournamentSocket, tournamentId, playerId, tournamentData);
}

async function sendBracketUpdateToUser(tournamentSocket: TypedSocketNamespace, tournamentId: string, playerId: User['id'], tournamentDetails: Awaited<ReturnType<typeof getTournamentFullDetailsById>>) {
	const dto = await craftTournamentDetailsForUser(tournamentDetails, playerId);
	// README: SOCKET-EVENT
	tournamentSocket.to(`${tournamentId}:${playerId}`).emit('bracket-updated', dto);
}



export function tournamentBroadcastParticipantJoined(tournamentId: string, participant: { id: string, username: string }, slotPosition: number) {
	const tournamentNamespace = app.io.of("/tournament");
	tournamentNamespace.to(tournamentId).emit('participant-joined-tournament', {
		tournamentId,
		participant,
		slotPosition,
		timestamp: new Date()
	});
}

export function tournamentBroadcastParticipantLeft(tournamentId: string, participant: { id: string, username: string }, slotPosition: number) {
	const tournamentNamespace = app.io.of("/tournament");
	tournamentNamespace.to(tournamentId).emit('participant-left-tournament', {
		tournamentId,
		participant,
		slotPosition,
		timestamp: new Date()
	});
}


export type TournamentStatusChangeEventData = {
	tournamentId: string;
	newStatus: string;
	changedBy: string;
	message: string;
	timestamp: Date;
	winner: {
		id: string;
		username: string;
	} | undefined;
}
/**
 * Notify all tournament lobby participants about the tournament status change (e.g. when the tournament is started or completed)
 * @param tournamentId tournament id
 * @param newStatus new tournament status
 * @param changedBy who changed the status
 * @param message optional message
 * @param winner optional winner info when tournament is completed
 */
export function tournamentBroadcastStatusChange(
	tournamentId: string,
	newStatus: string,
	changedBy: string,
	message?: string,
	winner?: { id: string, username: string },
) {
	const tournamentNamespace = app.io.of("/tournament");
	const eventData: TournamentStatusChangeEventData = {
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

/**
 * @deprecated Not used on the frontend. //TODO: remove this
 */
export function tournamentBroadcastAIPlayersAdded(tournamentId: string, aiPlayerIds: string[], filledSlots: number[]) {
	const tournamentNamespace = app.io.of("/tournament");
	tournamentNamespace.to(tournamentId).emit('ai-players-added', {
		tournamentId,
		aiPlayerIds,
		filledSlots,
		message: `${aiPlayerIds.length} AI players added to fill empty slots`,
		timestamp: new Date()
	});
}

export function tournamentBroadcastTournamentDeleted(tournamentId: string, tournamentName: string, deletedBy: string) {
	const tournamentNamespace = app.io.of("/tournament");
	tournamentNamespace.to(tournamentId).emit('tournament-deleted', {
		tournamentId,
		tournamentName,
		deletedBy,
		message: `Tournament "${tournamentName}" has been deleted by the creator.`,
		timestamp: new Date()
	});
}

