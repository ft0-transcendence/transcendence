import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, t } from "../trpc";
import { z } from "zod";
import { TournamentType, GameType, TournamentStatus } from "@prisma/client";
import { updateGameStats, updateTournamentWinnerStats } from "../../utils/statsUtils";

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

            return tournaments.map(tournament => ({
                id: tournament.id,
                name: tournament.name,
                type: tournament.type,
                status: tournament.status,
                startDate: tournament.startDate,
                createdBy: tournament.createdBy,
                participantsCount: tournament._count.participants,
                maxParticipants: 8,
                hasPassword: !!tournament.password
            }));
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

            if (!tournament) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Tournament not found" });
            }

            // Check if current user is registered to this tournament
            const isRegisteredToTournament = ctx.user?.id 
                ? tournament.participants.some(p => p.user.id === ctx.user!.id)
                : false;

            return {
                id: tournament.id,
                name: tournament.name,
                type: tournament.type,
                status: tournament.status,
                startDate: tournament.startDate,
                endDate: tournament.endDate,
                createdBy: tournament.createdBy,
                winner: tournament.winner,
                participants: tournament.participants.map(p => p.user),
                participantsCount: tournament._count.participants,
                maxParticipants: 8,
                games: tournament.games.map(g => ({
                    ...g,
                    scoreGoal: g.scoreGoal || 7
                })),
                hasPassword: !!tournament.password,
                isRegisteredToTournament
            };
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

            const size = 8;
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
                scoreGoal: g.scoreGoal || 7
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
            const { gameId } = input;
            const userId = ctx.user!.id;

            // check se partita esiste ed è tipo TOURNAMENT
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

            if (game.type !== GameType.TOURNAMENT) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Not a tournament game" });
            }

            if (!game.tournament) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Game has no associated tournament" });
            }

            // check se utente è partecipante del torneo
            const isParticipant = game.tournament.participants.some(p => p.userId === userId);
            if (!isParticipant) {
                throw new TRPCError({ code: "FORBIDDEN", message: "You are not a participant in this tournament" });
            }

            // check se utente è nella partita
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
                    scoreGoal: game.scoreGoal || 7
                },
                tournament: {
                    id: game.tournament.id,
                    name: game.tournament.name,
                    type: game.tournament.type
                },
                isPlayer: true,
                playerSide: game.leftPlayerId === userId ? 'left' : 'right'
            };
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
                    userPosition: t.winnerId === ctx.user!.id ? 1 : null // Potremmo calcolare la posizione reale
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
        .input(z.object({ tournamentId: z.string(), password: z.string().optional() }))
        .mutation(async ({ ctx, input }) => {
            const tournament = await ctx.db.tournament.findUnique({
                where: { id: input.tournamentId },
                include: { participants: true }
            });

            if (!tournament) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' });
            }

            if (tournament.password && tournament.password !== input.password) {
                throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid password' });
            }

            const alreadyJoined = tournament.participants.some(p => p.userId === ctx.user!.id);
            if (alreadyJoined) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already joined this tournament' });
            }

            const maxParticipants = 8;
            if (tournament.participants.length >= maxParticipants) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tournament is full' });
            }

            const participant = await ctx.db.tournamentParticipant.create({
                data: { tournamentId: input.tournamentId, userId: ctx.user!.id },
                include: { user: { select: { id: true, username: true } } }
            });

            return participant;
        }),

    leaveTournament: protectedProcedure
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
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot leave tournament that has already started' });
            }

            const participant = await ctx.db.tournamentParticipant.findFirst({
                where: { tournamentId: input.tournamentId, userId: ctx.user!.id }
            });

            if (!participant) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'You are not a participant in this tournament' });
            }

            await ctx.db.tournamentParticipant.delete({ where: { id: participant.id } });
            return { success: true } as const;
        }),

    startTournament: protectedProcedure
        .input(z.object({ tournamentId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const t = await ctx.db.tournament.findUnique({
                where: { id: input.tournamentId },
                include: {
                    participants: { include: { user: true } },
                    games: true
                }
            });

            if (!t) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' });
            }

            if (t.createdById !== ctx.user!.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the tournament creator can start the tournament' });
            }

            if (t.games.length > 0) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tournament already started' });
            }

            const maxParticipants = 8;
            if (t.participants.length < maxParticipants) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tournament is not full' });
            }

            await ctx.db.tournament.update({
                where: { id: t.id },
                data: { status: 'IN_PROGRESS' as TournamentStatus }
            });

            const participantIds = t.participants.map(p => p.userId);
            const roundsCount = Math.log2(t.participants.length);
            let parentRoundGameIds: string[] = [];

            const finalGame = await ctx.db.game.create({
                data: {
                    type: 'TOURNAMENT',
                    startDate: new Date(),
                    tournamentId: t.id,
                    leftPlayerId: participantIds[0],
                    rightPlayerId: participantIds[1],
                    scoreGoal: 7
                },
                select: { id: true }
            });

            parentRoundGameIds = [finalGame.id];

            for (let r = roundsCount - 2; r >= 0; r--) {
                const gamesInRound = 2 ** r;
                const newRoundIds: string[] = [];
                for (let gi = 0; gi < gamesInRound; gi++) {
                    const nextGameId = parentRoundGameIds[Math.floor(gi / 2)];
                    let leftPlayerId: string;
                    let rightPlayerId: string;
                    if (r === 0) {
                        const pairIndex = gi * 2;
                        leftPlayerId = participantIds[pairIndex];
                        rightPlayerId = participantIds[pairIndex + 1];
                    } else {
                        leftPlayerId = participantIds[0];
                        rightPlayerId = participantIds[1];
                    }
                    const created = await ctx.db.game.create({
                        data: {
                            type: 'TOURNAMENT',
                            startDate: new Date(),
                            tournamentId: t.id,
                            leftPlayerId,
                            rightPlayerId,
                            nextGameId,
                            scoreGoal: 7
                        },
                        select: { id: true }
                    });
                    newRoundIds.push(created.id);
                }
                parentRoundGameIds = newRoundIds;
            }

            return await ctx.db.tournament.findUnique({
                where: { id: t.id },
                include: {
                    participants: { include: { user: true } },
                    games: { include: { leftPlayer: true, rightPlayer: true }, orderBy: { startDate: 'asc' } }
                }
            });
        }),

    cancelTournament: protectedProcedure
        .input(z.object({ tournamentId: z.string() }))
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

            await ctx.db.tournament.update({
                where: { id: t.id },
                data: { status: 'CANCELLED' as TournamentStatus, endDate: new Date() }
            });

            return { success: true } as const;
        }),

    createTournament: protectedProcedure
        .input(z.object({
            name: z.string().min(3).max(50),
            type: z.nativeEnum(TournamentType),
            password: z.string().optional(),
            startDate: z.string().datetime().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const tournament = await ctx.db.tournament.create({
                data: {
                    name: input.name,
                    type: input.type,
                    password: input.password,
                    startDate: input.startDate ? new Date(input.startDate) : new Date(),
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

            await ctx.db.tournamentParticipant.create({
                data: { tournamentId: tournament.id, userId: ctx.user!.id }
            });

            return tournament;
        }),
});