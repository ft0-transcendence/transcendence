import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, t } from "../trpc";
import { z } from "zod";
import { TournamentType, GameType, TournamentStatus } from "@prisma/client";
import sanitizeHtml from 'sanitize-html';
import { BracketGenerator } from "../../../game/bracketGenerator";
import { addTournamentToCache, removeTournamentFromCache, cache, updateTournamentBracket, TournamentCacheEntry } from "../../cache";
import { broadcastBracketUpdate, broadcastParticipantJoined, broadcastParticipantLeft, broadcastTournamentStatusChange, broadcastAIPlayersAdded, broadcastTournamentDeleted } from "../../socket-io";
import { AIPlayerService } from "../../services/aiPlayerService";
import { 
	TournamentValidator, 
	tournamentValidationSchemas,
	handleTournamentError,
	validateCacheConsistency
} from "../../utils/tournamentValidation";

const TOURNAMENT_SIZES: {[key in TournamentType]: number} = {
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

	getTournaments: publicProcedure
		.input(z.object({
			limit: z.number().min(1).max(100).default(20),
			cursor: z.string().nullish()
		}))
		.query(async ({ ctx, input }) => {
			const tournaments = await ctx.db.tournament.findMany({
				take: input.limit + 1,
				cursor: input.cursor ? { id: input.cursor } : undefined,
				orderBy: { startDate: 'desc' },
				include: {
					createdBy: true,
					participants: {
						include: {
							user: true
						}
					},
					_count: {
						select: {
							participants: true
						}
					}
				}
			});

			let nextCursor: typeof input.cursor | undefined = undefined;
			if (tournaments.length > input.limit) {
				const nextItem = tournaments.pop();
				nextCursor = nextItem!.id;
			}

			return {
				tournaments,
				nextCursor
			};
		}),

	getTournamentDetails: publicProcedure
		.input(z.object({
			tournamentId: z.string()
		}))
		.query(async ({ ctx, input }) => {
			try {
				const tournament = await ctx.db.tournament.findUnique({
					where: { id: input.tournamentId },
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

				TournamentValidator.validateTournamentExists(tournament, input.tournamentId);

				if (tournament!.status === 'WAITING_PLAYERS' || tournament!.status === 'IN_PROGRESS') {
					validateCacheConsistency(input.tournamentId, ctx.db);
				}

				const isRegisteredToTournament = ctx.user?.id
					? tournament!.participants.some((p: any) => p.user.id === ctx.user!.id)
					: false;

				return {
					id: tournament!.id,
					name: tournament!.name,
					type: tournament!.type,
					status: tournament!.status,
					startDate: tournament!.startDate,
					endDate: tournament!.endDate,
					createdBy: tournament!.createdBy,
					winner: tournament!.winner,
					participants: tournament!.participants.map((p: any) => p.user),
					participantsCount: tournament!._count.participants,
					maxParticipants: 8,
					games: tournament!.games.map((g: any) => ({
						...g,
						scoreGoal: g.scoreGoal || 7,
						tournamentRound: (g as any).tournamentRound
					})),
					isRegisteredToTournament
				};

			} catch (error) {
				handleTournamentError(error as Error, 'getTournamentDetails', input.tournamentId, ctx.user?.id);
			}
		}),




	getTournamentParticipants: publicProcedure
		.input(z.object({
			tournamentId: z.string()
		}))
		.query(async ({ ctx, input }) => {
			const tournament = await ctx.db.tournament.findUnique({
				where: { id: input.tournamentId },
				include: {
					participants: {
						include: {
							user: {
								select: {
									id: true,
									username: true
								}
							}
						}
					}
				}
			});

			if (!tournament) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Tournament not found" });
			}

			return tournament.participants.map(p => ({
				id: p.user.id,
				username: p.user.username
			}));
		}),

	getBracket: publicProcedure
		.input(z.object({
			tournamentId: z.string()
		}))
		.query(async ({ ctx, input }) => {
			const t = await ctx.db.tournament.findUnique({
				where: { id: input.tournamentId },
				include: {
					games: {
						include: {
							leftPlayer: true,
							rightPlayer: true,
							previousGames: { select: { id: true, nextGameId: true } }
						}
					},
					participants: { include: { user: true } }
				}
			});

			if (!t) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Tournament not found" });
			}

			const size = TOURNAMENT_SIZES[t.type ?? TournamentType.EIGHT];
			const gamesById = new Map(t.games.map(g => [g.id, g]));
			const firstRound = t.games.filter(g => g.previousGames.length === 0);
			const rounds = [] as any[][];

			if (firstRound.length === size / 2) {
				rounds.push(firstRound);
				let current = firstRound;
				while (current.length > 1) {
					const nextIds = Array.from(new Set(current.map(g => g.nextGameId).filter(Boolean))) as string[];
					const nextRound = nextIds.map(id => gamesById.get(id)!).filter(Boolean);
					rounds.push(nextRound);
					current = nextRound;
				}
			} else {
				const estimatedRounds = Math.log2(size);
				const sorted = [...t.games].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
				let idx = 0;
				for (let r = 0; r < estimatedRounds; r++) {
					const gamesInRound = size / 2 ** (r + 1);
					rounds.push(sorted.slice(idx, idx + gamesInRound));
					idx += gamesInRound;
				}
			}

			const simplify = (g: typeof t.games[number]) => ({
				id: g.id,
				leftPlayer: g.leftPlayer ? { id: g.leftPlayer.id, username: g.leftPlayer.username } : null,
				rightPlayer: g.rightPlayer ? { id: g.rightPlayer.id, username: g.rightPlayer.username } : null,
				leftPlayerScore: g.leftPlayerScore,
				rightPlayerScore: g.rightPlayerScore,
				nextGameId: g.nextGameId,
				endDate: g.endDate,
				scoreGoal: g.scoreGoal || 7,
				tournamentRound: (g as any).tournamentRound
			});

			return {
				tournament: {
					id: t.id,
					name: t.name,
					type: t.type,
					startDate: t.startDate,
					endDate: t.endDate,
					participants: t.participants.map(p => ({ id: p.user.id, username: p.user.username }))
				},
				rounds: rounds.map(round => round.map(simplify))
			};
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

				// Validations
				if (!game) {
					throw new TRPCError({ code: "NOT_FOUND", message: "Game not found" });
				}

				if (game.type !== GameType.TOURNAMENT && game.type !== GameType.AI) {
					throw new TRPCError({ code: "BAD_REQUEST", message: "Not a tournament game" });
				}

				if (!game.tournament) {
					throw new TRPCError({ code: "BAD_REQUEST", message: "Game has no associated tournament" });
				}

				const isParticipant = game.tournament!.participants.some((p: any) => p.userId === userId);
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

				return {
					game: {
						id: game.id,
						leftPlayer: game.leftPlayer,
						rightPlayer: game.rightPlayer,
						leftPlayerScore: game.leftPlayerScore,
						rightPlayerScore: game.rightPlayerScore,
						startDate: game.startDate,
						scoreGoal: game.scoreGoal || 7,
						tournamentRound: game.tournamentRound
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

	//user vede la sua historu dei tornei
	getTournamentHistory: protectedProcedure
		.input(z.object({
			limit: z.number().min(1).max(100).default(20),
			cursor: z.string().nullish()
		}))
		.query(async ({ ctx, input }) => {
			const tournaments = await ctx.db.tournament.findMany({
				take: input.limit + 1,
				cursor: input.cursor ? { id: input.cursor } : undefined,
				where: {
					status: 'COMPLETED',
					participants: {
						some: {
							userId: ctx.user!.id
						}
					}
				},
				orderBy: { endDate: 'desc' },
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
					}
				}
			});

			let nextCursor: typeof input.cursor | undefined = undefined;
			if (tournaments.length > input.limit) {
				const nextItem = tournaments.pop();
				nextCursor = nextItem!.id;
			}

			return {
				tournaments: tournaments.map(t => ({
					...t,
					userWon: t.winnerId === ctx.user!.id,
					userPosition: t.winnerId === ctx.user!.id ? 1 : null
				})),
				nextCursor
			};
		}),

	getTournamentsStats: protectedProcedure
		.query(async ({ ctx }) => {
			const userId = ctx.user!.id;

			const [tournamentsWon, tournamentsPlayed] = await Promise.all([
				ctx.db.tournament.count({
					where: { winnerId: userId }
				}),
				ctx.db.tournamentParticipant.count({
					where: { userId }
				}),
			]);

			return {
				tournamentsWon,
				tournamentsPlayed,
				winRate: tournamentsPlayed > 0 ? Math.round((tournamentsWon / tournamentsPlayed) * 100) : 0
			};
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
						include: { tournament: { include: { participants: { include: { user: { select: { id: true, username: true } } } } } } }
					});

					const bracketGenerator = new BracketGenerator(tx);
					await bracketGenerator.assignParticipantToSlot(input.tournamentId, ctx.user!.id);

					return participant;
				});

				// 3. Update tournament cache and broadcast bracket update
				const cachedTournament = cache.tournaments.active.get(input.tournamentId);
				if (cachedTournament) {
					cachedTournament.participants.add(ctx.user!.id);
					
					// Update participant slots in cache
					const bracketGenerator = new BracketGenerator(ctx.db);
					const occupiedSlots = await bracketGenerator.getOccupiedSlots(input.tournamentId);
					const participantSlots = new Map<number, string | null>();
					
					// Initialize 8 slots
					for (let i = 0; i < 8; i++) {
						participantSlots.set(i, null);
					}
					
					// Fill with occupied slots
					occupiedSlots.forEach((playerId, slotIndex) => {
						participantSlots.set(slotIndex, playerId);
					});
					
					updateTournamentBracket(input.tournamentId, participantSlots);
					
					// Find the slot position for the new participant
					const slotPosition = Array.from(participantSlots.entries())
						.find(([_, playerId]) => playerId === ctx.user!.id)?.[0] || -1;
					
					// Broadcast participant joined and bracket update
					broadcastParticipantJoined(input.tournamentId, {
						id: ctx.user!.id,
						username: ctx.user!.username
					}, slotPosition);
					
					broadcastBracketUpdate(input.tournamentId, participantSlots, cachedTournament.aiPlayers);
				}

				return result.tournament.participants.map(p=>({id: p.user.id, username: p.user.username}));
		}),

	leaveTournament: protectedProcedure
		.input(z.object({ tournamentId: tournamentValidationSchemas.tournamentId }))
		.mutation(async ({ ctx, input }) => {
			try {
				const tournament = await ctx.db.tournament.findUnique({
					where: { id: input.tournamentId },
					include: { participants: true, games: true }
				});

				// Validations
				TournamentValidator.validateTournamentExists(tournament, input.tournamentId);
				TournamentValidator.validateTournamentStatus(tournament!.status, ['WAITING_PLAYERS'], 'leave');

				const participant = await ctx.db.tournamentParticipant.findFirst({
					where: { tournamentId: input.tournamentId, userId: ctx.user!.id }
				});

				TournamentValidator.validateNotParticipant(!!participant);
				TournamentValidator.validateBracketExists(tournament!.games.length);

				const result = await ctx.db.$transaction(async (tx) => {
					const bracketGenerator = new BracketGenerator(tx);
					await bracketGenerator.removeParticipantFromSlot(input.tournamentId, ctx.user!.id);

					await tx.tournamentParticipant.delete({ where: { id: participant!.id } });

					const remainingParticipants = await tx.tournamentParticipant.count({
						where: { tournamentId: input.tournamentId }
					});

					if (remainingParticipants === 0) {
						const aiPlayerService = new AIPlayerService(tx);
						await aiPlayerService.cleanupTournamentAIPlayers(input.tournamentId);

						await tx.game.deleteMany({
							where: { tournamentId: input.tournamentId }
						});

						await tx.tournament.delete({
							where: { id: input.tournamentId }
						});

						return {
							success: true,
							tournamentDeleted: true,
							message: 'Tournament deleted as no participants remain'
						} as const;
					}

					return {
						success: true,
						tournamentDeleted: false
					} as const;
				});

				const cachedTournament = cache.tournaments.active.get(input.tournamentId);
				if (cachedTournament && !result.tournamentDeleted) {
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
					
					broadcastParticipantLeft(input.tournamentId, {
						id: ctx.user!.id,
						username: ctx.user!.username
					}, -1);
					
					broadcastBracketUpdate(input.tournamentId, participantSlots, cachedTournament.aiPlayers);
				}

				if (result.tournamentDeleted) {
					removeTournamentFromCache(input.tournamentId);					
					broadcastTournamentDeleted(input.tournamentId, tournament!.name, ctx.user!.username);
				}

				return result;

			} catch (error) {
				handleTournamentError(error as Error, 'leaveTournament', input.tournamentId, ctx.user!.id);
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

				// Validations
				TournamentValidator.validateTournamentExists(tournament, input.tournamentId);
				TournamentValidator.validateCreatorPermission(tournament!.createdById, ctx.user!.id, 'start tournament');
				TournamentValidator.validateTournamentStatus(tournament!.status, ['WAITING_PLAYERS'], 'start');

				const result = await ctx.db.$transaction(async (tx) => {
					const bracketGenerator = new BracketGenerator(tx);
					const occupiedSlots = await bracketGenerator.getOccupiedSlotsCount(input.tournamentId);
					
					let createdAIPlayers: string[] = [];
					if (occupiedSlots < 8) {
						createdAIPlayers = await bracketGenerator.fillEmptySlotsWithAI(input.tournamentId);
					}

					await tx.tournament.update({
						where: { id: input.tournamentId },
						data: {
							status: 'IN_PROGRESS' as TournamentStatus,
							startDate: new Date()
						}
					});

					return { createdAIPlayers };
				});

				const cachedTournament = cache.tournaments.active.get(input.tournamentId);
				if (cachedTournament) {
					cachedTournament.status = 'IN_PROGRESS';
					result.createdAIPlayers.forEach(aiPlayerId => {
						cachedTournament.aiPlayers.add(aiPlayerId);
					});
					
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
					
					broadcastTournamentStatusChange(input.tournamentId, 'IN_PROGRESS', ctx.user!.username, 
						`Tournament started with ${result.createdAIPlayers.length} AI players filling empty slots`);
					
					if (result.createdAIPlayers.length > 0) {
						const filledSlots = Array.from(participantSlots.entries())
							.filter(([_, playerId]) => result.createdAIPlayers.includes(playerId || ''))
							.map(([slotIndex, _]) => slotIndex);
						
						broadcastAIPlayersAdded(input.tournamentId, result.createdAIPlayers, filledSlots);
					}
					
					broadcastBracketUpdate(input.tournamentId, participantSlots, cachedTournament.aiPlayers);
				}

				return await ctx.db.tournament.findUnique({
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
								tournamentRound: true
							}, 
							orderBy: { startDate: 'asc' } 
						}
					}
				});

			} catch (error) {
				handleTournamentError(error as Error, 'startTournament', input.tournamentId, ctx.user!.id);
			}
		}),

	cancelTournament: protectedProcedure
		.input(z.object({ tournamentId: tournamentValidationSchemas.tournamentId }))
		.mutation(async ({ ctx, input }) => {

			const t = await ctx.db.tournament.findUnique({
				where: { id: input.tournamentId },
				include: { participants: true, games: true }
			});

			if (!t) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' });
			}

			if (t.createdById !== ctx.user!.id) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the tournament creator can cancel the tournament' });
			}

			if (t.status === 'COMPLETED') {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot cancel a completed tournament' });
			}

			await ctx.db.$transaction(async (tx) => {
				const aiPlayerService = new AIPlayerService(tx);
				await aiPlayerService.cleanupTournamentAIPlayers(t.id);

				await tx.game.deleteMany({
					where: { tournamentId: t.id }
				});

				await tx.tournament.update({
					where: { id: t.id },
					data: { status: 'CANCELLED' as TournamentStatus, endDate: new Date() }
				});
			});

			const cachedTournament = cache.tournaments.active.get(t.id);
			if (cachedTournament) {
				cachedTournament.status = 'CANCELLED';
				cachedTournament.aiPlayers.clear();
				
				broadcastTournamentStatusChange(t.id, 'CANCELLED', ctx.user!.username, 
					`Tournament "${t.name}" has been cancelled by the creator`);
			}

			return { success: true } as const;
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

				// Validations
				TournamentValidator.validateTournamentExists(tournament, input.tournamentId);
				TournamentValidator.validateCreatorPermission(tournament!.createdById, ctx.user!.id, 'delete tournament');
				
				if (tournament!.status === 'COMPLETED') {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'Cannot delete a completed tournament'
					});
				}

				const participantsToNotify = tournament!.participants
					.filter((p: any) => p.userId !== ctx.user!.id)
					.map((p: any) => ({
						id: p.user.id,
						username: p.user.username
					}));

				await ctx.db.$transaction(async (tx) => {
					const aiPlayerService = new AIPlayerService(tx);
					await aiPlayerService.cleanupTournamentAIPlayers(input.tournamentId);

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
				broadcastTournamentDeleted(input.tournamentId, tournament!.name, ctx.user!.username);

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
			name: z.string().min(3).max(50),
			type: z.nativeEnum(TournamentType),
			startDate: z.string().datetime().optional(),
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
					const bracket = await bracketGenerator.generateAndCreateBracket(tournament.id, []);

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
					status: result.status as 'WAITING_PLAYERS' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
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
