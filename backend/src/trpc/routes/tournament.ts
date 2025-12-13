import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, t } from "../trpc";
import { z } from "zod";
import { TournamentType, GameType, TournamentStatus, PrismaClient, Tournament, TournamentRound, User } from "@prisma/client";
import sanitizeHtml from 'sanitize-html';
import { BracketGenerator } from "../../../game/bracketGenerator";
import { addTournamentToCache, removeTournamentFromCache, cache, updateTournamentBracket, TournamentCacheEntry } from "../../cache";
import { tournamentBroadcastBracketUpdate, tournamentBroadcastAIPlayersAdded, tournamentBroadcastParticipantJoined, tournamentBroadcastParticipantLeft, tournamentBroadcastStatusChange, tournamentBroadcastTournamentDeleted } from "../../socket/tournamentSocketNamespace";
import { AIPlayerService } from "../../services/aiPlayerService";
import {
	TournamentValidator,
	tournamentValidationSchemas,
	handleTournamentError,
	validateCacheConsistency
} from "../../utils/tournamentValidation";
import { STANDARD_GAME_CONFIG } from "../../../shared_exports";
import { TournamentGame } from "../../../game/tournamentGame";
import { app } from "../../../main";
import { db } from "../db";

const TOURNAMENT_SIZES: { [key in TournamentType]: number } = {
	EIGHT: 8
}


export const tournamentRouter = t.router({

	getAvailableTournaments: publicProcedure
		.query(async ({ ctx }) => {
			const tournaments = await ctx.db.tournament.findMany({
				where: {
					status: {
						in: ['WAITING_PLAYERS', 'IN_PROGRESS']
					}
				},
				include: {
					createdBy: {
						select: {
							id: true,
							username: true
						}
					},
					participants: {
						include: {
							user: {
								select: {
									id: true,
									username: true
								}
							}
						}
					},
					_count: {
						select: {
							participants: true
						}
					}
				},
				orderBy: {
					startDate: 'asc'
				}
			});

			return tournaments.map(tournament => {
				const hasUserJoined = ctx.user?.id
					? tournament.participants.some(p => p.user.id === ctx.user!.id)
					: false;

				const participants = tournament.participants.map(p => ({
					id: p.user.id,
					username: p.user.username
				}));

				const isStarted = tournament.status === 'IN_PROGRESS' || tournament.status === 'COMPLETED';

				return {
					id: tournament.id,
					name: tournament.name,
					type: tournament.type,
					status: tournament.status,
					startDate: tournament.startDate,
					createdBy: tournament.createdBy,
					participantsCount: tournament._count.participants,
					maxParticipants: 8,
					hasUserJoined,
					participants,
					isStarted
				};
			});
		}),

	getTournamentDetails: publicProcedure
		.input(z.object({
			tournamentId: z.string()
		}))
		.query(async ({ ctx, input }) => {
			const result = await getTournamentDetails(input.tournamentId, ctx.user);
			app.log.debug(`[getTournamentDetails] Returning result with ${result.games?.length} games`);
			return result
		}),

	joinTournamentGame: protectedProcedure
		.input(z.object({
			gameId: z.string()
		}))
		.mutation(async ({ ctx, input }) => {
			try {
				const { gameId } = input;
				const userId = ctx.user!.id;

				const game = await ctx.db.game.findUnique({
					where: { id: gameId },
					include: {
						leftPlayer: true,
						rightPlayer: true,
						tournament: {
							include: {
								participants: {
									include: { user: true }
								}
							}
						}
					}
				});

				if (!game) {
					throw new TRPCError({ code: "NOT_FOUND", message: "Game not found" });
				}

				if (game.type !== GameType.TOURNAMENT && game.type !== GameType.AI) {
					throw new TRPCError({ code: "BAD_REQUEST", message: "Not a tournament game" });
				}

				if (!game.tournament) {
					throw new TRPCError({ code: "BAD_REQUEST", message: "Game has no associated tournament" });
				}

				const isParticipant = game.tournament!.participants.some((p) => p.userId === userId);
				if (!isParticipant) {
					throw new TRPCError({ code: "FORBIDDEN", message: "You are not a participant in this tournament" });
				}

				const isPlayerInGame = game.leftPlayerId === userId || game.rightPlayerId === userId;
				if (!isPlayerInGame) {
					throw new TRPCError({ code: "FORBIDDEN", message: "You are not a player in this game" });
				}

				if (game.endDate) {
					throw new TRPCError({ code: "BAD_REQUEST", message: "Game already finished" });
				}

				const aiPlayerService = new AIPlayerService(ctx.db);

				return {
					game: {
						id: game.id,
						leftPlayer: game.leftPlayer,
						rightPlayer: game.rightPlayer,
						leftPlayerScore: game.leftPlayerScore,
						rightPlayerScore: game.rightPlayerScore,
						startDate: game.startDate,
						scoreGoal: game.scoreGoal || STANDARD_GAME_CONFIG.maxScore,
						tournamentRound: game.tournamentRound,
						leftPlayerUsername: game.leftPlayerUsername,
						rightPlayerUsername: game.rightPlayerUsername,
						leftPlayerIsAI: aiPlayerService.isAIPlayer(game.leftPlayerUsername),
						rightPlayerIsAI: aiPlayerService.isAIPlayer(game.rightPlayerUsername),
						isAIGame: aiPlayerService.isAIPlayer(game.leftPlayerUsername) || aiPlayerService.isAIPlayer(game.rightPlayerUsername)
					},
					tournament: {
						id: game.tournament!.id,
						name: game.tournament!.name,
						type: game.tournament!.type
					},
					isPlayer: true,
					playerSide: game.leftPlayerId === userId ? 'left' : 'right'
				};

			} catch (error) {
				handleTournamentError(error as Error, 'joinTournamentGame', undefined, ctx.user!.id);
			}
		}),

	joinTournament: protectedProcedure
		.input(z.object({ tournamentId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const tournament = await ctx.db.tournament.findUnique({
				where: { id: input.tournamentId },
				include: { participants: true, games: true }
			});

			if (!tournament) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' });
			}

			if (tournament.status !== 'WAITING_PLAYERS') {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot join tournament that has already started' });
			}

			const alreadyJoined = tournament.participants.some(p => p.userId === ctx.user!.id);
			if (alreadyJoined) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already joined this tournament' });
			}

			const maxParticipants = 8;
			if (tournament.participants.length >= maxParticipants) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tournament is full' });
			}

			const result = await ctx.db.$transaction(async (tx) => {
				const participant = await tx.tournamentParticipant.create({
					data: { tournamentId: input.tournamentId, userId: ctx.user!.id },
					include: { user: { select: { id: true, username: true } } }
				});

				const bracketGenerator = new BracketGenerator(tx);
				await bracketGenerator.assignParticipantToSlot(input.tournamentId, ctx.user!.id);

				const updatedTournament = await tx.tournament.findUnique({
					where: { id: input.tournamentId },
					include: {
						participants: {
							include: { user: { select: { id: true, username: true } } }
						}
					}
				});

				return { participant, updatedTournament };
			});

			const cachedTournament = cache.tournaments.active.get(input.tournamentId);
			if (cachedTournament) {
				cachedTournament.participants.add(ctx.user!.id);

				const bracketGenerator = new BracketGenerator(ctx.db);
				const occupiedSlots = await bracketGenerator.getOccupiedSlots(input.tournamentId);
				const participantSlots = new Map<number, string | null>();

				for (let i = 0; i < 8; i++) {
					participantSlots.set(i, null);
				}

				occupiedSlots.forEach((playerId, slotIndex) => {
					participantSlots.set(slotIndex, playerId);
				});

				updateTournamentBracket(input.tournamentId, participantSlots);

				const slotPosition = Array.from(participantSlots.entries())
					.find(([_, playerId]) => playerId === ctx.user!.id)?.[0] ?? -1;

				tournamentBroadcastParticipantJoined(input.tournamentId, {
					id: ctx.user!.id,
					username: ctx.user!.username
				}, slotPosition);

				tournamentBroadcastBracketUpdate(input.tournamentId, participantSlots, cachedTournament.aiPlayers);
			}

			if (!result.updatedTournament) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to update tournament'
				});
			}

			return result.updatedTournament.participants.map(p => ({
				id: p.user.id,
				username: p.user.username
			}));
		}),

	leaveTournament: protectedProcedure
		.input(z.object({ tournamentId: tournamentValidationSchemas.tournamentId }))
		.mutation(async ({ ctx, input }) => {
			try {
				const tournament = await ctx.db.tournament.findUnique({
					where: { id: input.tournamentId },
					include: {
						participants: {
							include: { user: { select: { id: true, username: true } } }
						},
						games: true
					}
				});

				TournamentValidator.validateTournamentExists(tournament, input.tournamentId);
				TournamentValidator.validateTournamentStatus(tournament!.status, ['WAITING_PLAYERS'], 'leave');

				const participant = tournament!.participants.find(p => p.userId === ctx.user!.id);
				if (!participant) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'You are not a participant of this tournament'
					});
				}

				const isLastParticipant = tournament!.participants.length === 1;

				const result = await ctx.db.$transaction(async (tx) => {
					await tx.tournamentParticipant.delete({
						where: { id: participant.id }
					});

					const bracketGenerator = new BracketGenerator(tx);
					await bracketGenerator.removeParticipantFromSlots(input.tournamentId, ctx.user!.id);

					if (isLastParticipant) {
						await tx.game.deleteMany({
							where: { tournamentId: input.tournamentId }
						});

						await tx.tournament.delete({
							where: { id: input.tournamentId }
						});

						return { tournamentDeleted: true };
					}

					const updatedTournament = await tx.tournament.findUnique({
						where: { id: input.tournamentId },
						include: {
							participants: {
								include: { user: { select: { id: true, username: true } } }
							}
						}
					});

					return { updatedTournament };
				});

				if (isLastParticipant) {
					removeTournamentFromCache(input.tournamentId);
					return { success: true, tournamentDeleted: true };
				}

				const cachedTournament = cache.tournaments.active.get(input.tournamentId);
				if (cachedTournament) {
					cachedTournament.participants.delete(ctx.user!.id);

					const bracketGenerator = new BracketGenerator(ctx.db);
					const occupiedSlots = await bracketGenerator.getOccupiedSlots(input.tournamentId);
					const participantSlots = new Map<number, string | null>();

					for (let i = 0; i < 8; i++) {
						participantSlots.set(i, null);
					}

					occupiedSlots.forEach((playerId, slotIndex) => {
						participantSlots.set(slotIndex, playerId);
					});

					updateTournamentBracket(input.tournamentId, participantSlots);

					const slotPosition = Array.from(participantSlots.entries())
						.find(([_, playerId]) => playerId === ctx.user!.id)?.[0] ?? -1;

					tournamentBroadcastParticipantLeft(input.tournamentId, {
						id: ctx.user!.id,
						username: ctx.user!.username
					}, slotPosition);
					tournamentBroadcastBracketUpdate(input.tournamentId, participantSlots, cachedTournament.aiPlayers);
				}

				return { success: true, tournamentDeleted: false };
			} catch (error) {
				app.log.warn('Error leaving tournament:', error);
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to leave tournament',
					cause: error
				});
			}
		}),

	startTournament: protectedProcedure
		.input(z.object({ tournamentId: tournamentValidationSchemas.tournamentId }))
		.mutation(async ({ ctx, input }) => {
			try {
				const tournament = await ctx.db.tournament.findUnique({
					where: { id: input.tournamentId },
					include: {
						participants: { include: { user: true } },
						games: true
					}
				});

				TournamentValidator.validateTournamentExists(tournament, input.tournamentId);
				TournamentValidator.validateCreatorPermission(tournament!.createdById, ctx.user!.id, 'start tournament');
				TournamentValidator.validateTournamentStatus(tournament!.status, ['WAITING_PLAYERS'], 'start');

				await executeTournamentStart(ctx.db, tournament!, ctx.user!.username);

				const tournamentResult = await ctx.db.tournament.findUnique({
					where: { id: input.tournamentId },
					select: {
						id: true,
						name: true,
						type: true,
						status: true,
						startDate: true,
						participants: {
							select: {
								user: { select: { id: true, username: true } }
							}
						},
						games: {
							select: {
								id: true,
								leftPlayer: { select: { id: true, username: true } },
								rightPlayer: { select: { id: true, username: true } },
								leftPlayerScore: true,
								rightPlayerScore: true,
								startDate: true,
								endDate: true,
								tournamentRound: true,
								leftPlayerUsername: true,
								rightPlayerUsername: true
							},
							orderBy: { startDate: 'asc' }
						}
					}
				});

				if (tournamentResult) {
					const aiPlayerService = new AIPlayerService(ctx.db);
					return {
						...tournamentResult,
						games: tournamentResult.games.map(game => ({
							...game,
							leftPlayerIsAI: aiPlayerService.isAIPlayer(game.leftPlayerUsername),
							rightPlayerIsAI: aiPlayerService.isAIPlayer(game.rightPlayerUsername),
							isAIGame: aiPlayerService.isAIPlayer(game.leftPlayerUsername) || aiPlayerService.isAIPlayer(game.rightPlayerUsername)
						}))
					};
				}

				return tournamentResult;

			} catch (error) {
				handleTournamentError(error as Error, 'startTournament', input.tournamentId, ctx.user!.id);
			}
		}),

	deleteTournament: protectedProcedure
		.input(z.object({ tournamentId: tournamentValidationSchemas.tournamentId }))
		.mutation(async ({ ctx, input }) => {
			try {
				const tournament = await ctx.db.tournament.findUnique({
					where: { id: input.tournamentId },
					include: {
						participants: {
							include: {
								user: {
									select: { id: true, username: true }
								}
							}
						},
						games: true
					}
				});

				TournamentValidator.validateTournamentExists(tournament, input.tournamentId);
				TournamentValidator.validateCreatorPermission(tournament!.createdById, ctx.user!.id, 'delete tournament');

				if (tournament!.status === 'COMPLETED') {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'Cannot delete a completed tournament'
					});
				}

				const participantsToNotify = tournament!.participants
					.filter((p) => p.userId !== ctx.user!.id)
					.map((p) => ({
						id: p.user.id,
						username: p.user.username
					}));

				await ctx.db.$transaction(async (tx) => {
					await tx.game.deleteMany({
						where: { tournamentId: input.tournamentId }
					});

					await tx.tournamentParticipant.deleteMany({
						where: { tournamentId: input.tournamentId }
					});

					await tx.tournament.delete({
						where: { id: input.tournamentId }
					});
				});

				removeTournamentFromCache(input.tournamentId);
				tournamentBroadcastTournamentDeleted(input.tournamentId, tournament!.name, ctx.user!.username);

				return {
					success: true,
					message: 'Tournament deleted successfully',
					notifiedParticipants: participantsToNotify.length
				};

			} catch (error) {
				handleTournamentError(error as Error, 'deleteTournament', input.tournamentId, ctx.user!.id);
			}
		}),

	createTournament: protectedProcedure
		.input(z.object({
			name: z.string().min(3, "Tournament name must be at least 3 characters").max(50),
			type: z.nativeEnum(TournamentType),
			startDate: z.string().datetime().optional()
				.refine((dateString) => {
					if (!dateString) return true;
					const date = new Date(dateString);
					const now = new Date();
					return date > now;
				}, {
					message: "Start date must be in the future"
				}),
		}))
		.mutation(async ({ ctx, input }) => {
			try {
				// If no startDate set to 1 hour from now
				const defaultStartDate = new Date();
				defaultStartDate.setHours(defaultStartDate.getHours() + 1);

				const result = await ctx.db.$transaction(async (tx) => {
					const tournament = await tx.tournament.create({
						data: {
							name: sanitizeHtml(input.name),
							type: input.type,
							startDate: input.startDate ? new Date(input.startDate) : defaultStartDate,
							createdById: ctx.user!.id,
						},
						include: {
							createdBy: { select: { id: true, username: true } },
							participants: {
								include: {
									user: { select: { id: true, username: true } }
								}
							}
						}
					});

					const bracketGenerator = new BracketGenerator(tx);
					const bracket = await bracketGenerator.generateAndCreateBracket(tournament, []);

					await tx.tournamentParticipant.create({
						data: { tournamentId: tournament.id, userId: ctx.user!.id }
					});

					await bracketGenerator.assignParticipantToSlot(tournament.id, ctx.user!.id);

					return tournament;
				});

				const participantSlots = new Map<number, string | null>();
				for (let i = 0; i < 8; i++) {
					participantSlots.set(i, i === 0 ? ctx.user!.id : null);
				}

				const tournamentCacheEntry: TournamentCacheEntry = {
					id: result.id,
					name: result.name,
					type: result.type as 'EIGHT',
					status: result.status as 'WAITING_PLAYERS' | 'IN_PROGRESS' | 'COMPLETED',
					participants: new Set([ctx.user!.id]),
					connectedUsers: new Set(),
					creatorId: ctx.user!.id,
					bracketCreated: true,
					aiPlayers: new Set(),
					lastBracketUpdate: new Date(),
					participantSlots
				};

				addTournamentToCache(result.id, tournamentCacheEntry);

				return result;

			} catch (error) {
				handleTournamentError(error as Error, 'createTournament', undefined, ctx.user!.id);
			}
		}),
});

async function createTournamentGameInstances(db: PrismaClient, tournamentId: string): Promise<void> {
	app.log.info(`🎮 Creating TournamentGame instances for tournament ${tournamentId} (quarter finals only)`);

	const tournamentNamespace = app.io.of("/tournament");

	// Only create instances for QUARTER FINALS initially
	const allGames = await db.game.findMany({
		where: {
			tournamentId,
			tournamentRound: 'QUARTI',
			endDate: null
		},
		select: {
			id: true,
			scoreGoal: true,
			leftPlayerScore: true,
			rightPlayerScore: true,
			tournamentRound: true,
			leftPlayer: { select: { id: true, username: true } },
			rightPlayer: { select: { id: true, username: true } },
			leftPlayerUsername: true,
			rightPlayerUsername: true
		},
		orderBy: { startDate: 'asc' }
	});

	const aiPlayerService = new AIPlayerService(db);
	let humanGamesCreated = 0;
	let aiGamesSkipped = 0;

	for (const game of allGames) {
		const isLeftAI = aiPlayerService.isAIPlayer(game.leftPlayerUsername);
		const isRightAI = aiPlayerService.isAIPlayer(game.rightPlayerUsername);

		if (isLeftAI && isRightAI) {
			app.log.debug(`⏭️ Skipping AI vs AI game ${game.id} - already handled by simulation`);
			aiGamesSkipped++;
			continue;
		}

		app.log.info(`🆕 Creating TournamentGame instance for game ${game.id} (round: ${game.tournamentRound})`);

		const gameInstance = new TournamentGame(
			game.id,
			tournamentId,
			tournamentNamespace,
			{ maxScore: game.scoreGoal || STANDARD_GAME_CONFIG.maxScore },
			async (state: any, _tid: string, gid: string) => {
				const isAborted = gameInstance.wasForfeited;

				app.log.info(`🏁 Tournament Game ${gid} finished - scores: ${state.scores.left}-${state.scores.right}, forfeited: ${isAborted}`);

				await db.game.update({
					where: { id: gid },
					data: {
						endDate: new Date(),
						abortDate: isAborted ? new Date() : null,
						leftPlayerScore: state.scores.left,
						rightPlayerScore: state.scores.right
					}
				});

				cache.tournaments.activeTournamentGames.delete(gid);
				app.log.info(`🗑️ Tournament Game ${gid} removed from cache`);
			},
			async () => {
				await db.game.update({
					where: { id: game.id },
					data: { updatedAt: new Date() }
				});
			}
		);

		gameInstance.setPlayers(
			{ id: game.leftPlayer.id, username: game.leftPlayer.username, isPlayer: true },
			{ id: game.rightPlayer.id, username: game.rightPlayer.username, isPlayer: true }
		);

		// Add to cache
		cache.tournaments.activeTournamentGames.set(game.id, gameInstance);
		humanGamesCreated++;

		app.log.info(`✅ TournamentGame instance created for ${game.id} - Left: ${game.leftPlayer.username}, Right: ${game.rightPlayer.username}`);
	}

	app.log.info(`🎮 Tournament ${tournamentId}: Created ${humanGamesCreated} human game instances, skipped ${aiGamesSkipped} AI vs AI games`);
}

export async function createGameInstanceIfNeeded(db: PrismaClient, tournamentId: string, gameId: string): Promise<boolean> {

	const existingInstance = cache.tournaments.activeTournamentGames.get(gameId);
	if (existingInstance) {
		app.log.debug(`🔄 Game instance ${gameId} already exists, skipping creation`);
		return false;
	}

	const game = await db.game.findUnique({
		where: { id: gameId },
		select: {
			id: true,
			scoreGoal: true,
			leftPlayerScore: true,
			rightPlayerScore: true,
			tournamentRound: true,
			leftPlayer: { select: { id: true, username: true } },
			rightPlayer: { select: { id: true, username: true } },
			leftPlayerUsername: true,
			rightPlayerUsername: true,
			endDate: true
		}
	});

	if (!game || game.endDate) {
		app.log.debug(`⚠️ Game ${gameId} not found or already ended`);
		return false;
	}

	const aiPlayerService = new AIPlayerService(db);
	const isLeftAI = aiPlayerService.isAIPlayer(game.leftPlayerUsername);
	const isRightAI = aiPlayerService.isAIPlayer(game.rightPlayerUsername);

	// Don't create instance if both are AI
	if (isLeftAI && isRightAI) {
		app.log.debug(`⏭️ Game ${gameId} is AI vs AI, no instance needed`);
		return false;
	}

	if (!game.leftPlayerUsername || !game.rightPlayerUsername) {
		app.log.debug(`⏭️ Game ${gameId} has empty slots, waiting for players`);
		return false;
	}

	app.log.info(`🆕 Creating on-demand game instance for ${gameId} (${game.tournamentRound})`);

	const tournamentNamespace = app.io.of("/tournament");
	const gameInstance = new TournamentGame(
		game.id,
		tournamentId,
		tournamentNamespace,
		{ maxScore: game.scoreGoal || STANDARD_GAME_CONFIG.maxScore },
		async (state: any, _tid: string, gid: string) => {
			const isAborted = gameInstance.wasForfeited;
			app.log.info(`🏁 Tournament Game ${gid} finished - scores: ${state.scores.left}-${state.scores.right}, forfeited: ${isAborted}`);

			await db.game.update({
				where: { id: gid },
				data: {
					endDate: new Date(),
					abortDate: isAborted ? new Date() : null,
					leftPlayerScore: state.scores.left,
					rightPlayerScore: state.scores.right
				}
			});

			cache.tournaments.activeTournamentGames.delete(gid);
			app.log.info(`🗑️ Tournament Game ${gid} removed from cache`);
		},
		async () => {
			await db.game.update({
				where: { id: game.id },
				data: { updatedAt: new Date() }
			});
		}
	);

	gameInstance.setPlayers(
		{ id: game.leftPlayer.id, username: game.leftPlayer.username, isPlayer: true },
		{ id: game.rightPlayer.id, username: game.rightPlayer.username, isPlayer: true }
	);

	if (game.leftPlayerScore > 0 || game.rightPlayerScore > 0) {
		gameInstance.scores.left = game.leftPlayerScore;
		gameInstance.scores.right = game.rightPlayerScore;
		app.log.info(`📊 Restored scores for game ${game.id}: ${game.leftPlayerScore}-${game.rightPlayerScore}`);
	}

	cache.tournaments.activeTournamentGames.set(game.id, gameInstance);
	app.log.info(`✅ On-demand game instance created for ${game.id} - Left: ${game.leftPlayer.username}, Right: ${game.rightPlayer.username}`);

	return true;
}

//Only creates instances for games with at least one human player
export async function checkAndCreateNextRoundInstances(db: PrismaClient, tournamentId: string, currentRound: 'QUARTI' | 'SEMIFINALE' | 'FINALE'): Promise<void> {
	app.log.debug(`🔍 Checking if round ${currentRound} is complete for tournament ${tournamentId}`);

	const currentRoundGames = await db.game.findMany({
		where: {
			tournamentId,
			tournamentRound: currentRound
		},
		select: {
			id: true,
			endDate: true,
			nextGameId: true
		}
	});

	// Check if all games in current round are finished
	const allGamesFinished = currentRoundGames.every(game => game.endDate !== null);

	if (!allGamesFinished) {
		app.log.debug(`⏳ Round ${currentRound} not yet complete - waiting for all games to finish`);
		return;
	}

	app.log.debug(`✅ Round ${currentRound} is complete! Checking for next round games...`);

	let nextRound: 'SEMIFINALE' | 'FINALE' | null = null;
	if (currentRound === 'QUARTI') {
		nextRound = 'SEMIFINALE';
	} else if (currentRound === 'SEMIFINALE') {
		nextRound = 'FINALE';
	}

	if (!nextRound) {
		app.log.debug(`🏆 Tournament ${tournamentId} is complete (FINALE finished)`);
		return;
	}

	const nextRoundGames = await db.game.findMany({
		where: {
			tournamentId,
			tournamentRound: nextRound,
			endDate: null
		},
		select: {
			id: true,
			scoreGoal: true,
			leftPlayerScore: true,
			rightPlayerScore: true,
			tournamentRound: true,
			leftPlayer: { select: { id: true, username: true } },
			rightPlayer: { select: { id: true, username: true } },
			leftPlayerUsername: true,
			rightPlayerUsername: true
		},
		orderBy: { startDate: 'asc' }
	});

	const aiPlayerService = new AIPlayerService(db);

	const tournamentNamespace = app.io.of("/tournament");
	let humanGamesCreated = 0;
	let aiGamesSkipped = 0;

	for (const game of nextRoundGames) {
		if (cache.tournaments.activeTournamentGames.has(game.id)) {
			app.log.debug(`⏭️ Game instance ${game.id} already exists, skipping`);
			continue;
		}

		const isLeftAI = aiPlayerService.isAIPlayer(game.leftPlayerUsername);
		const isRightAI = aiPlayerService.isAIPlayer(game.rightPlayerUsername);

		// Skip AI vs AI games (they are handled by simulation)
		if (isLeftAI && isRightAI) {
			app.log.debug(`⏭️ Skipping AI vs AI game ${game.id} (${nextRound}) - handled by simulation`);
			aiGamesSkipped++;
			continue;
		}

		const EMPTY_SLOT = 'Empty slot';
		if (game.leftPlayerUsername === EMPTY_SLOT || game.rightPlayerUsername === EMPTY_SLOT ||
			game.leftPlayerUsername === undefined || game.rightPlayerUsername === undefined) {
			app.log.debug(`⏭️ Game ${game.id} has empty slots, waiting for players`);
			continue;
		}

		app.log.info(`🆕 Creating TournamentGame instance for ${nextRound} game ${game.id}`);

		const gameInstance = new TournamentGame(
			game.id,
			tournamentId,
			tournamentNamespace,
			{ maxScore: game.scoreGoal || STANDARD_GAME_CONFIG.maxScore },
			async (state: any, _tid: string, gid: string) => {
				const isAborted = gameInstance.wasForfeited;

				app.log.info(`🏁 Tournament Game ${gid} finished - scores: ${state.scores.left}-${state.scores.right}, forfeited: ${isAborted}`);

				await db.game.update({
					where: { id: gid },
					data: {
						endDate: new Date(),
						abortDate: isAborted ? new Date() : null,
						leftPlayerScore: state.scores.left,
						rightPlayerScore: state.scores.right
					}
				});

				cache.tournaments.activeTournamentGames.delete(gid);
				app.log.info(`🗑️ Tournament Game ${gid} removed from cache`);
			},
			async () => {
				await db.game.update({
					where: { id: game.id },
					data: { updatedAt: new Date() }
				});
			}
		);

		gameInstance.setPlayers(
			{ id: game.leftPlayer.id, username: game.leftPlayer.username, isPlayer: true },
			{ id: game.rightPlayer.id, username: game.rightPlayer.username, isPlayer: true }
		);

		cache.tournaments.activeTournamentGames.set(game.id, gameInstance);
		humanGamesCreated++;

		app.log.info(`✅ TournamentGame instance created for ${game.id} (${nextRound}) - Left: ${game.leftPlayer.username}, Right: ${game.rightPlayer.username}`);
	}

	app.log.info(`🎮 Next round ${nextRound}: Created ${humanGamesCreated} human game instances, skipped ${aiGamesSkipped} AI vs AI games`);
}

async function executeTournamentStart(db: PrismaClient, tournament: Tournament, startedByUsername: string) {
	const createdAIPlayers = await db.$transaction(async (tx) => {
		app.log.info(`Starting tournament (${tournament.name}) #${tournament.id}`);
		const bracketGenerator = new BracketGenerator(tx);
		const occupiedSlots = await bracketGenerator.getOccupiedSlotsCount(tournament.id);

		let createdAIPlayers: string[] = [];
		if (occupiedSlots < TOURNAMENT_SIZES[tournament.type ?? TournamentType.EIGHT]) {
			createdAIPlayers = await bracketGenerator.fillEmptySlotsWithAI(tournament.id, db);
		}
		app.log.info(`Created ${createdAIPlayers.length} AI players for tournament #${tournament.id}`);

		const startDate = new Date();

		await tx.tournament.update({
			where: { id: tournament.id },
			data: {
				status: 'IN_PROGRESS' as TournamentStatus,
				startDate: startDate
			}
		});


		const result = await tx.game.updateMany({
			where: {
				tournamentId: tournament.id,
				tournamentRound: TournamentRound.QUARTI
			},
			data: {
				startDate: startDate
			}
		});
		app.log.debug(`Updated tournament #${tournament.id} startDate for the initial round=${TournamentRound.QUARTI} games (${result.count})`);

		return createdAIPlayers;
	});

	const cachedTournament = cache.tournaments.active.get(tournament.id);
	if (cachedTournament) {
		cachedTournament.status = 'IN_PROGRESS';
		createdAIPlayers.forEach((aiPlayerId: string) => {
			cachedTournament.aiPlayers.add(aiPlayerId);
		});

		const bracketGenerator = new BracketGenerator(db);
		const occupiedSlots = await bracketGenerator.getOccupiedSlots(tournament.id);
		const participantSlots = new Map<number, string | null>();

		for (let i = 0; i < 8; i++) {
			participantSlots.set(i, null);
		}

		occupiedSlots.forEach((playerId, slotIndex) => {
			participantSlots.set(slotIndex, playerId);
		});

		updateTournamentBracket(tournament.id, participantSlots);

		const isAutoStart = startedByUsername === 'System';
		const message = isAutoStart
			? `Tournament started automatically with ${createdAIPlayers.length} AI players filling empty slots`
			: `Tournament started with ${createdAIPlayers.length} AI players filling empty slots`;

		tournamentBroadcastStatusChange(tournament.id, 'IN_PROGRESS', startedByUsername, message);

		if (createdAIPlayers.length > 0) {
			const filledSlots = Array.from(participantSlots.entries())
				.filter(([_, playerId]) => createdAIPlayers.includes(playerId || ''))
				.map(([slotIndex, _]) => slotIndex);

			tournamentBroadcastAIPlayersAdded(tournament.id, createdAIPlayers, filledSlots);
		}

		tournamentBroadcastBracketUpdate(tournament.id, participantSlots, cachedTournament.aiPlayers);
	}

	// NEW: Create TournamentGame instances for non-AI-vs-AI games
	await createTournamentGameInstances(db, tournament.id);

	return createdAIPlayers;
}

export async function autoStartTournament(db: PrismaClient, tournamentId: string): Promise<void> {
	const tournament = await db.tournament.findUnique({
		where: { id: tournamentId },
		include: { participants: { include: { user: true } }, games: true }
	});

	if (!tournament || tournament.status !== 'WAITING_PLAYERS') {
		return;
	}

	await executeTournamentStart(db, tournament, 'System');
}


export async function getTournamentDetails(tournamentId: string, requestedByUser?: User | null) {
	try {
		const tournament = await getTournamentFullDetailsById(tournamentId, true);


		if (tournament!.status === 'WAITING_PLAYERS' || tournament!.status === 'IN_PROGRESS') {
			validateCacheConsistency(tournamentId, db);
		}

		const result = await craftTournamentDetailsForUser(tournament, requestedByUser?.id);

		return result!;
	} catch (error) {
		app.log.error(`[getTournamentDetails] Error occurred:`, error);
		handleTournamentError(error as Error, 'getTournamentDetails', tournamentId, requestedByUser?.id);
	}
}

export async function craftTournamentDetailsForUser(tournamentData: Awaited<ReturnType<typeof getTournamentFullDetailsById>>, requestedByUserId?: User['id']) {

	const isRegisteredToTournament = requestedByUserId
		? tournamentData!.participants.some((p) => p.id === requestedByUserId)
		: false;


	const result = {
		...tournamentData,
		isRegisteredToTournament
	};
	return result;
}


export async function getTournamentFullDetailsById(tournamentId: string, shouldExpandThrownError = false) {
	try {
		const tournament = await db.tournament.findUnique({
			where: { id: tournamentId },
			include: {
				createdBy: {
					select: {
						id: true,
						username: true
					}
				},
				winner: {
					select: {
						id: true,
						username: true
					}
				},
				participants: {
					include: {
						user: {
							select: {
								id: true,
								username: true
							}
						}
					}
				},
				games: {
					include: {
						leftPlayer: {
							select: {
								id: true,
								username: true
							}
						},
						rightPlayer: {
							select: {
								id: true,
								username: true
							}
						},
						previousGames: {
							select: {
								id: true
							}
						}
					},
					orderBy: { startDate: 'asc' }
				},
				_count: {
					select: {
						participants: true
					}
				}
			}
		});
		if (!tournament) {
			throw new TRPCError({
				code: 'NOT_FOUND',
				message: 'Tournament not found'
			});
		}

		const aiPlayerService = new AIPlayerService(db);

		// TODO: sort the games in order per each type (QUARTI, SEMIFINALE, FINALE)
		/*
		[0,1,2,3,4,5,6] ->
		Frontend will render from top to bottom like this (it's not required to SEMIFINALE being the first 4 matches, QUARTI to be the middle and FINALE to be the last, but the order per each type is important):
		- 0(SEMIFINALE)
		- 1(SEMIFINALE) - 4(QUARTI)
							- 6(FINALE)
		- 2(SEMIFINALE) - 5(QUARTI)
		- 3(SEMIFINALE)
		*/
		const mappedGames = tournament.games.map((g) => {
			const previousGames = g.previousGames?.map(pg => pg.id) || [];
			return {
				id: g.id,
				leftPlayer: g.leftPlayer,
				rightPlayer: g.rightPlayer,
				leftPlayerScore: g.leftPlayerScore,
				rightPlayerScore: g.rightPlayerScore,
				startDate: g.startDate,
				endDate: g.endDate,
				abortDate: g.abortDate,
				scoreGoal: g.scoreGoal || STANDARD_GAME_CONFIG.maxScore,
				tournamentRound: g.tournamentRound,
				leftPlayerUsername: g.leftPlayerUsername,
				rightPlayerUsername: g.rightPlayerUsername,
				isAIGame: aiPlayerService.isAIPlayer(g.leftPlayerUsername) || aiPlayerService.isAIPlayer(g.rightPlayerUsername),
				leftPlayerIsAI: aiPlayerService.isAIPlayer(g.leftPlayerUsername),
				rightPlayerIsAI: aiPlayerService.isAIPlayer(g.rightPlayerUsername),
				nextGameId: g.nextGameId,
				previousGames,
			};
		});

		return {
			id: tournament!.id,
			name: tournament!.name,
			type: tournament!.type,
			status: tournament!.status,

			startDate: tournament!.startDate,
			endDate: tournament!.endDate,
			createdBy: tournament!.createdBy,

			winner: tournament!.winner,

			participants: tournament!.participants.map(p => p.user),
			participantsCount: tournament!._count.participants,
			maxParticipants: TOURNAMENT_SIZES[tournament!.type ?? TournamentType.EIGHT],

			games: mappedGames
		};
	} catch (error) {
		app.log.warn(`[getTournamentDetails] Error occurred while fetching tournament #${tournamentId}:`, error);
		if (shouldExpandThrownError) {
			throw error;
		} else {
			return null;
		}
	}
}
