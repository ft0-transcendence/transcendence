import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, t } from "../trpc";
import { z } from "zod";
import { TournamentType, PrismaClient, Tournament, TournamentRound, User, Game as PrismaGame } from "@prisma/client";
import sanitizeHtml from 'sanitize-html';
import { BracketGenerator } from "../../../game/bracketGenerator";
import { addTournamentToCache, removeTournamentFromCache, cache, updateTournamentBracket, TournamentCacheEntry } from "../../cache";
import { tournamentBroadcastParticipantJoined, tournamentBroadcastParticipantLeft, tournamentBroadcastTournamentDeleted, tournamentBroadcastBracketUpdateById } from "../../socket/tournamentSocketNamespace";
import { AIPlayerService } from "../../services/aiPlayerService";
import {
	TournamentValidator,
	tournamentValidationSchemas,
	handleTournamentError
} from "../../utils/tournamentValidation";
import { app } from "../../../main";
import { db } from "../db";
import { createTournamentGameInstance } from "../../../game/tournamentGame";
import { env } from "../../../env";

const TOURNAMENT_SIZES: { [key in TournamentType]: number } = {
	EIGHT: 8
}


export const tournamentRouter = t.router({

	getAvailableTournaments: publicProcedure
		.query(async ({ ctx }) => {
			return await getAvailableTournamentListDTO(ctx.user?.id);
		}),

	getTournamentDetails: publicProcedure
		.input(z.object({
			tournamentId: z.string()
		}))
		.query(async ({ ctx, input }) => {
			const result = await getTournamentDetailsById(input.tournamentId, ctx.user);
			app.log.debug(`[getTournamentDetails] Returning result with ${result.games?.length} games`);
			return result
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
					include: { user: { select: { id: true, username: true, tournamentUsername: true } } }
				});

				const bracketGenerator = new BracketGenerator(tx);
				await bracketGenerator.assignParticipantToSlot(input.tournamentId, ctx.user!.id);

				const updatedTournament = await tx.tournament.findUnique({
					where: { id: input.tournamentId },
					include: {
						participants: {
							include: { user: { select: { id: true, username: true, tournamentUsername: true } } }
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

				tournamentBroadcastBracketUpdateById(input.tournamentId);
			}

			if (!result.updatedTournament) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to update tournament'
				});
			}

			tournamentBroadcastBracketUpdateById(input.tournamentId);

			return result.updatedTournament.participants.map(p => ({
				id: p.user.id,
				username: p.user.username,
				tournamentUsername: p.user.tournamentUsername
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

					return { tournamentDeleted: false };
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
				}
				tournamentBroadcastBracketUpdateById(input.tournamentId);

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

				await executeTournamentStart(tournament!, ctx.user!.username);

				return getTournamentDetailsById(input.tournamentId, ctx.user);

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
			return await createTournamentByUser(ctx.user.id, input, ctx.db);
		}),

	// TODO: remove this after testing
	clearAllTournaments: protectedProcedure
		.mutation(async ({ ctx }) => {
			try {
				const user = ctx.user;
				if (env.NODE_ENV !== 'development' || user.username.toLocaleLowerCase() !== "sandoramix") {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: ''
					});
				}
				await db.game.deleteMany({
					where: {
						tournamentId: {
							not: null
						}
					}
				});
				await db.tournamentParticipant.deleteMany();
				await db.tournament.deleteMany();

				return { success: true };
			} catch (error) {
				handleTournamentError(error as Error, 'clearAllTournaments');
			}
		}),
	makeItFlow: protectedProcedure
		.query(async (data) => {
			const { ctx } = data;
			if (ctx.user!.username.toLowerCase() !== 'sandoramix' || env.NODE_ENV !== 'development') {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: ''
				});
			};
			const user = await db.user.findFirst({
				where: { id: ctx.user!.id }
			});
			if (!user) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'User not found'
				});
			}

			const tournaments = await db.tournament.findMany({
				where: {
					createdById: user.id
				}
			});

			const tournamentIds = tournaments.map(t => t.id);

			await db.game.deleteMany({
				where: {
					tournamentId: { in: tournamentIds }
				}
			});
			await db.tournamentParticipant.deleteMany({
				where: {
					tournamentId: { in: tournamentIds }
				}
			});
			await db.tournament.deleteMany({
				where: {
					id: { in: tournamentIds }
				}
			});

			const nextHourDate = new Date();
			nextHourDate.setHours(nextHourDate.getHours() + 1);

			const tournament = await createTournamentByUser(user.id, { name: `GEN[${nextHourDate.toISOString()}]`, type: TournamentType.EIGHT, startDate: nextHourDate.toISOString() }, db);

			return tournament.id;
		})
});

async function createTournamentByUser(creatorId: string, input: { name: string, type: TournamentType, startDate?: string }, db: PrismaClient) {
	try {
		// If no startDate set to 1 hour from now
		const defaultStartDate = new Date();
		defaultStartDate.setHours(defaultStartDate.getHours() + 1);

		const result = await db.$transaction(async (tx) => {

			const tournament = await tx.tournament.create({
				data: {
					name: sanitizeHtml(input.name),
					type: input.type,
					startDate: input.startDate ? new Date(input.startDate) : defaultStartDate,
					createdById: creatorId,
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


			const creator = await tx.tournamentParticipant.create({
				data: { tournamentId: tournament.id, userId: creatorId }
			});

			const participants = tournament.participants.map(p => p.userId);
			participants.push(creator.userId);


			const bracketGenerator = new BracketGenerator(tx);
			const bracket = await bracketGenerator.generateAndCreateBracket(tournament, participants);


			// await bracketGenerator.assignParticipantToSlot(tournament.id, creatorId);

			return tournament;
		});

		const participantSlots = new Map<number, string | null>();
		for (let i = 0; i < 8; i++) {
			participantSlots.set(i, i === 0 ? creatorId : null);
		}

		const tournamentCacheEntry: TournamentCacheEntry = {
			id: result.id,
			name: result.name,
			type: result.type,
			status: result.status,
			participants: new Set([creatorId]),
			connectedUsers: new Set(),
			creatorId: creatorId,
			bracketCreated: true,
			lastBracketUpdate: new Date(),
			participantSlots
		};

		addTournamentToCache(result.id, tournamentCacheEntry);

		return result;

	} catch (error) {
		handleTournamentError(error as Error, 'createTournament', undefined, creatorId);
	}
}

async function createTournamentGameInstances(db: PrismaClient, tournamentId: string): Promise<void> {
	app.log.info(`🎮 Creating TournamentGame instances for tournament ${tournamentId} (quarter finals only)`);

	// Only create instances for QUARTER FINALS initially
	const allGames = await db.game.findMany({
		where: {
			tournamentId,
			tournamentRound: 'QUARTI',
			endDate: null
		},
		include: {
			leftPlayer: { select: { id: true, username: true } },
			rightPlayer: { select: { id: true, username: true } },
		},
		orderBy: { startDate: 'asc' }
	});

	let humanGamesCreated = 0;
	let aiGamesSkipped = 0;

	for (const game of allGames) {
		const isLeftAI = AIPlayerService.isAIPlayer(game.leftPlayerId, game.leftPlayerUsername);
		const isRightAI = AIPlayerService.isAIPlayer(game.rightPlayerId, game.rightPlayerUsername);

		if ((!game.leftPlayer && !isLeftAI) || (!game.rightPlayer && !isRightAI)) {
			app.log.debug(`⏭️ Skipping game ${game.id} - has empty slots`);
			continue;
		}

		if (isLeftAI && isRightAI) {
			app.log.debug(`⏭️Skipping AI vs AI game ${game.id} - already handled by simulation`);
			aiGamesSkipped++;
			continue;
		}

		app.log.info(`🆕 Creating TournamentGame instance for game ${game.id} (round: ${game.tournamentRound})`);

		const gameInstance = createTournamentGameInstance(tournamentId, game);
		if (!gameInstance) {
			continue ;
		}

		humanGamesCreated++;

		app.log.info(`✅ TournamentGame instance created for ${game.id} - Left: ${game.leftPlayerUsername}, Right: ${game.rightPlayerUsername}`);
	}

	app.log.info(`🎮 Tournament ${tournamentId}: Created ${humanGamesCreated} human game instances`);
}

//Only creates instances for games with at least one human player
export async function checkAndCreateNextRoundInstances(db: PrismaClient, tournamentId: string, currentRound: 'QUARTI' | 'SEMIFINALE' | 'FINALE'): Promise<void> {
	app.log.debug(`checkAndCreateNextRoundInstances: Checking if round ${currentRound} is complete for tournament ${tournamentId}`);

	const currentRoundGames = await db.game.findMany({
		where: {
			tournamentId,
			tournamentRound: currentRound
		}
	});

	// Check if all games in current round are finished
	const allGamesFinished = currentRoundGames.every(game => game.endDate !== null);

	if (!allGamesFinished) {
		app.log.debug(`checkAndCreateNextRoundInstances: Round ${currentRound} not yet complete - waiting for all games to finish`);
		return;
	}

	app.log.debug(`checkAndCreateNextRoundInstances: Round ${currentRound} is complete! Checking for next round games...`);

	let nextRound: 'SEMIFINALE' | 'FINALE' | null = null;
	if (currentRound === 'QUARTI') {
		nextRound = 'SEMIFINALE';
	} else if (currentRound === 'SEMIFINALE') {
		nextRound = 'FINALE';
	}

	if (!nextRound) {
		app.log.debug(`checkAndCreateNextRoundInstances: Tournament ${tournamentId} is complete (FINALE finished)`);
		return;
	}

	const nextRoundGames = await db.game.findMany({
		where: {
			tournamentId,
			tournamentRound: nextRound,
			endDate: null
		},
		include: {
			leftPlayer: { select: { id: true, username: true } },
			rightPlayer: { select: { id: true, username: true } },
		},
		orderBy: { startDate: 'asc' }
	});

	let humanGamesCreated = 0;
	let aiGamesSkipped = 0;

	for (const game of nextRoundGames) {
		if (cache.tournaments.activeTournamentGames.has(game.id)) {
			app.log.debug(`checkAndCreateNextRoundInstances: Game instance ${game.id} already exists, skipping`);
			continue;
		}

		const isLeftAI = AIPlayerService.isAIPlayer(game.leftPlayerId, game.leftPlayerUsername);
		const isRightAI = AIPlayerService.isAIPlayer(game.rightPlayerId, game.rightPlayerUsername);

		// Skip AI vs AI games (they are handled by simulation)
		if (isLeftAI && isRightAI) {
			app.log.debug(`checkAndCreateNextRoundInstances: Skipping AI vs AI game ${game.id} (${nextRound}) - handled by simulation`);
			aiGamesSkipped++;
			continue;
		}

		// Skip games with empty slots
		if ((!game.leftPlayer && !isLeftAI) || (!game.rightPlayer && !isRightAI)) {
			app.log.debug(`checkAndCreateNextRoundInstances: Game ${game.id} has empty slots, waiting for players`);
			continue;
		}

		app.log.info(`checkAndCreateNextRoundInstances: Creating TournamentGame instance for ${nextRound} game ${game.id}`);

		const gameInstance = createTournamentGameInstance(tournamentId, game);
		if (!gameInstance) {
			continue;
		}

		cache.tournaments.activeTournamentGames.set(game.id, gameInstance);
		humanGamesCreated++;

		app.log.info(`checkAndCreateNextRoundInstances: TournamentGame instance created for ${game.id} (${nextRound}) - Left: ${game.leftPlayerUsername}, Right: ${game.rightPlayerUsername}`);
	}

	app.log.info(`checkAndCreateNextRoundInstances: Next round ${nextRound}: Created ${humanGamesCreated} human game instances, skipped ${aiGamesSkipped} AI vs AI games`);
}

async function executeTournamentStart(tournament: Tournament, startedByUsername: string) {
	app.log.info(`Starting tournament (${tournament.name}) #${tournament.id}`);
	const bracketGenerator = new BracketGenerator(db);
	const occupiedSlots = await bracketGenerator.getOccupiedSlotsCount(tournament.id);

	if (occupiedSlots < TOURNAMENT_SIZES[tournament.type ?? TournamentType.EIGHT]) {
		app.log.info(`Creating AI players and autocompleting AI vs AI games for tournament #${tournament.id}`);
		await bracketGenerator.fillEmptySlotsWithAIAndProgressAutomatically(tournament.id);
		app.log.info(`Finished creating AI players and autocompleting AI vs AI games for tournament #${tournament.id}`);
	}

	const startDate = new Date();

	await db.tournament.update({
		where: { id: tournament.id },
		data: {
			status: 'IN_PROGRESS',
			startDate: startDate
		}
	});
	const result = await db.game.updateMany({
		where: {
			tournamentId: tournament.id,
			tournamentRound: TournamentRound.QUARTI
		},
		data: {
			startDate: startDate
		}
	});

	app.log.debug(`Updated tournament #${tournament.id} startDate for the initial round=${TournamentRound.QUARTI} games (${result.count})`);

	const cachedTournament = cache.tournaments.active.get(tournament.id);
	if (cachedTournament) {
		cachedTournament.status = 'IN_PROGRESS';

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

		// tournamentBroadcastStatusChange(tournament.id, 'IN_PROGRESS', startedByUsername, `Tournament started`);

		tournamentBroadcastBracketUpdateById(tournament.id);
	}

	// NEW: Create TournamentGame instances for non-AI-vs-AI games
	await createTournamentGameInstances(db, tournament.id);
}

export async function autoStartTournament(db: PrismaClient, tournamentId: string): Promise<void> {
	const tournament = await db.tournament.findUnique({
		where: { id: tournamentId },
		include: { participants: { include: { user: true } }, games: true }
	});

	if (!tournament
		|| tournament.status !== 'WAITING_PLAYERS'
	) {
		return;
	}

	await executeTournamentStart(tournament, 'System');
}


export async function getTournamentDetailsById(tournamentId: string, requestedByUser?: User | null) {
	try {
		const tournament = await getTournamentFullDetailsById(tournamentId, true);

		const result = await craftTournamentDTODetailsForUser(tournament, requestedByUser?.id);

		return result!;
	} catch (error) {
		app.log.error(`[getTournamentDetails] Error occurred:`, error);
		handleTournamentError(error as Error, 'getTournamentDetails', tournamentId, requestedByUser?.id);
	}
}

export function craftTournamentDTODetailsForUser(tournamentData: Awaited<ReturnType<typeof getTournamentFullDetailsById>>, requestedByUserId?: User['id']) {

	if (!tournamentData) {
		return null;
	}

	const isUserRegistered = requestedByUserId
		? tournamentData.participants.some((p) => p.id === requestedByUserId)
		: false;

	const isCreator = requestedByUserId
		? tournamentData.createdBy.id === requestedByUserId
		: false;

	const isWaitingForPlayers = tournamentData.status === 'WAITING_PLAYERS';
	const isStarted = tournamentData.status === 'IN_PROGRESS';
	const isEnded = tournamentData.status === 'COMPLETED';

	const canJoin = !isUserRegistered && isWaitingForPlayers && tournamentData.maxParticipants > tournamentData.participantsCount;
	const canLeave = isUserRegistered && isWaitingForPlayers;
	const canStart = isWaitingForPlayers && isCreator;
	const canDelete = isCreator;

	const myCurrentActiveGame = tournamentData.games.find(g => (g.leftPlayer?.id === requestedByUserId || g.rightPlayer?.id === requestedByUserId) && g.endDate == null && g.abortDate == null && g.startDate != null);

	const result = {
		...tournamentData,
		isUserRegistered,
		isCreator,
		canJoin,
		canLeave,
		canStart,
		canDelete,
		myCurrentActiveGame: myCurrentActiveGame?.id ?? null,
	};
	return result;
}

async function fetchTournamentsWithFullDetails(tournamentIds: string[]) {
	const tournaments = await db.tournament.findMany({
		where: {
			id: { in: tournamentIds }
		},
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
							username: true,
							tournamentUsername: true
						}
					}
				}
			},
			games: {
				include: {
					leftPlayer: {
						select: {
							id: true,
							username: true,
							tournamentUsername: true
						}
					},
					rightPlayer: {
						select: {
							id: true,
							username: true,
							tournamentUsername: true
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
	return tournaments;
}


export async function getAvailableTournamentListDTO(requestedByUserId?: User['id']) {
	const notEndedTournaments = (await db.tournament.findMany({
		where: {
			status: {
				not: 'COMPLETED'
			},
			endDate: null
		},
		select: {
			id: true,
		}
	})).map(t => t.id);

	const tournaments = await fetchTournamentsWithFullDetails(notEndedTournaments);
	const craftedTournaments = craftTournamentDetailsDTO(tournaments);
	return craftedTournaments.map(tournament => craftTournamentDTODetailsForUser(tournament, requestedByUserId)!);
}



export async function getTournamentFullDetailsById(tournamentId: string, shouldExpandThrownError = false) {
	try {
		const tournaments = await fetchTournamentsWithFullDetails([tournamentId]);
		const [tournament] = craftTournamentDetailsDTO(tournaments);

		if (!tournament) {
			throw new TRPCError({
				code: 'NOT_FOUND',
				message: 'Tournament not found'
			});
		}
		return tournament;

	} catch (error) {
		app.log.warn(`[getTournamentDetails] Error occurred while fetching tournament #${tournamentId}:`, error);
		if (shouldExpandThrownError) {
			throw error;
		} else {
			return null;
		}
	}
}

export function craftTournamentDetailsDTO(tournamentData: Awaited<ReturnType<typeof fetchTournamentsWithFullDetails>>) {
	return tournamentData.map((tournament) => {
		const mappedGames = mapTournamentGamesToDTO(tournament.games);
		return {
			id: tournament!.id,
			name: tournament!.name,
			type: tournament!.type,
			status: tournament!.status,

			startDate: tournament!.startDate,
			endDate: tournament!.endDate,
			createdBy: tournament!.createdBy,

			winner: tournament!.winner,
			winnerUsername: tournament!.winnerUsername,

			participants: tournament!.participants.map(p => p.user),
			participantsCount: tournament!._count.participants,
			maxParticipants: TOURNAMENT_SIZES[tournament!.type ?? TournamentType.EIGHT],

			games: mappedGames
		}
	});
}

export type MapTournamentGamesDTO = {
	leftPlayer: {
		id: string;
		username: string;
	} | null;
	rightPlayer: {
		id: string;
		username: string;
	} | null;
	previousGames: {
		id: string;
	}[];
} & PrismaGame;

export function mapTournamentGamesToDTO(rawGames: MapTournamentGamesDTO[]) {
	const mappedGames = rawGames.map((g) => {
		const previousGames = g.previousGames?.map(pg => pg.id) || [];

		const leftPlayerIsAI = AIPlayerService.isAIPlayer(g.leftPlayerId, g.leftPlayerUsername);
		const rightPlayerIsAI = AIPlayerService.isAIPlayer(g.rightPlayerId, g.rightPlayerUsername);

		return {
			...g,
			isAIGame: leftPlayerIsAI || rightPlayerIsAI,
			leftPlayerIsAI,
			rightPlayerIsAI,
			previousGames,
		};
	});

	const games = mappedGames.filter(g => g.tournamentRound);

	const byId = new Map(games.map(g => [g.id, g]));
	const byRound: Record<string, typeof games> = {};
	games.forEach(g => (byRound[g.tournamentRound!] ??= []).push(g));

	// Build children map (previousGames are the games that feed into this game)
	const children = new Map<string, string[]>();
	games.forEach(g => {
		g.previousGames?.forEach(pid => {
			(children.get(g.id) ?? children.set(g.id, []).get(g.id)!).push(pid);
		});
	});

	// DFS order (top → bottom) for consistent bracket ordering
	const order: string[] = [];

	function dfs(id: string) {
		const kids = children.get(id) ?? [];
		if (!kids.length) {
			order.push(id);
			return;
		}

		kids.forEach(dfs);
		order.push(id);
	}

	// Start from roots (finals) - games with no nextGameId
	games.filter(g => !g.nextGameId).forEach(g => dfs(g.id));

	// Index lookup for sorting
	const index = new Map(order.map((id, i) => [id, i]));

	// Sort each round using DFS traversal order (ensures consistent left-to-right bracket ordering)
	const sortedGamesByRound = Object.fromEntries(
		Object.entries(byRound).map(([round, gs]) => [
			round,
			gs.slice().sort((a, b) => index.get(a.id)! - index.get(b.id)!),
		])
	);

	// Combine rounds in tournament order: QUARTI → SEMIFINALE → FINALE
	const result = [
		...sortedGamesByRound.QUARTI,
		...sortedGamesByRound.SEMIFINALE,
		...sortedGamesByRound.FINALE,
	]
	return result;
}
