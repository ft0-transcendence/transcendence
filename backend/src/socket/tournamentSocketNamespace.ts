import { Server } from "socket.io";
import { applySocketAuth } from "../plugins/socketAuthSession";
import { TypedSocket, TypedSocketNamespace } from "../socket-io";
import { app } from "../../main";
import { db } from "../trpc/db";
import { cache } from "../cache";
import { User, Tournament, Game as PrismaGame } from '@prisma/client';
import { GameUserInfo } from "../../shared_exports";
import { OnlineGame } from "../../game/onlineGame";
import { MovePaddleAction } from '../../game/game';
import { craftTournamentDTODetailsForUser, getTournamentFullDetailsById } from "../trpc/routes/tournament";


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
						type: tournament.type,
						status: tournament.status,
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

				await socket.join(getTournamentRoomName(tournamentId));
				await socket.join(getTournamentRoomName(tournamentId, user.id));

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

						const isLeft = nextMatch.leftPlayerId === user.id;
						const leftId = isLeft ? nextMatch.leftPlayerId : null;
						const rightId = isLeft ? null : nextMatch.rightPlayerId;

					}
				}

				// Notify other participants about user joining lobby
				socket.to(getTournamentRoomName(tournamentId)).emit('user-joined-tournament-lobby', {
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
			app.log.info("User id=%s username=%s disconnected from tournament namespace", user.id, user.username);

			// Remove user from all tournament lobbies
			for (const [tournamentId, lobby] of cache.tournaments.tournamentLobbies) {
				if (lobby.has(user.id)) {
					lobby.delete(user.id);
					if (lobby.size === 0) {
						cache.tournaments.tournamentLobbies.delete(tournamentId);
					}

					// Notify remaining users in lobby
					socket.to(getTournamentRoomName(tournamentId)).emit('user-left-tournament-lobby', {
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
	});
}



// Helper functions for tournament notifications
function getTournamentRoomName(tournamentId: string, userId?: User['id']) {
	if (!userId) return `tournament:${tournamentId}`;
	return `tournament:${tournamentId}:${userId}`;
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
	const dto = craftTournamentDTODetailsForUser(tournamentDetails, playerId);
	// README: SOCKET-EVENT
	tournamentSocket.to(getTournamentRoomName(tournamentId, playerId)).emit('bracket-updated', dto);
}



export function tournamentBroadcastParticipantJoined(tournamentId: string, participant: { id: string, username: string }, slotPosition: number) {
	const tournamentNamespace = app.io.of("/tournament");
	tournamentNamespace.to(getTournamentRoomName(tournamentId)).emit('participant-joined-tournament', {
		tournamentId,
		participant,
		slotPosition,
		timestamp: new Date()
	});
}

export function tournamentBroadcastParticipantLeft(tournamentId: string, participant: { id: string, username: string }, slotPosition: number) {
	const tournamentNamespace = app.io.of("/tournament");
	tournamentNamespace.to(getTournamentRoomName(tournamentId)).emit('participant-left-tournament', {
		tournamentId,
		participant,
		slotPosition,
		timestamp: new Date()
	});
}

export function tournamentBroadcastTournamentCompleted(tournamentId: string, winnerId: PrismaGame['leftPlayerId'] | PrismaGame['rightPlayerId'], winnerUsername: Tournament['winnerUsername']) {
	const tournamentNamespace = app.io.of("/tournament");

	tournamentNamespace.to(getTournamentRoomName(tournamentId)).emit('tournament-completed', {
		winnerId,
		winnerUsername,
	});
}

export function tournamentBroadcastTournamentDeleted(tournamentId: string, tournamentName: string, deletedBy: string) {
	const tournamentNamespace = app.io.of("/tournament");
	tournamentNamespace.to(getTournamentRoomName(tournamentId)).emit('tournament-deleted', {
		tournamentId,
		tournamentName,
		deletedBy,
		message: `Tournament "${tournamentName}" has been deleted by the creator.`,
		timestamp: new Date()
	});
}

export function notifyPlayersAboutNewTournamentGame(tournamentId: PrismaGame['tournamentId'], gameId: PrismaGame['id'], leftPlayerId: string | null, rightPlayerId: string | null, leftPlayerUsername: string | null = null, rightPlayerUsername: string | null = null) {
	if (!tournamentId) return;
	app.log.info(`Notifying players about new tournament game. tournamentId=${tournamentId}, gameId=${gameId}, leftPlayerId=${leftPlayerId}, rightPlayerId=${rightPlayerId}`);
	const tournamentNamespace = app.io.of("/tournament");
	if (leftPlayerId !== null) {
		tournamentNamespace.to(getTournamentRoomName(tournamentId, leftPlayerId)).emit(`your-match-is-ready`, { gameId, tournamentId, opponent: rightPlayerUsername });
	}
	if (rightPlayerId !== null) {
		tournamentNamespace.to(getTournamentRoomName(tournamentId, rightPlayerId)).emit(`your-match-is-ready`, { gameId, tournamentId, opponent: leftPlayerUsername });
	}
}
