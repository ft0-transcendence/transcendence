// TODO: da fare join-tournament-game
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, t } from "../trpc";
import { z } from "zod";
import { TournamentType, GameType } from "@prisma/client";

export const tournamentRouter = t.router({
    createTournament: protectedProcedure
        .input(z.object({
            name: z.string().min(3).max(50),
            type: z.nativeEnum(TournamentType),
            password: z.string().optional(),
            startDate: z.date().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            const tournament = await ctx.db.tournament.create({
                data: {
                    name: input.name,
                    type: input.type,
                    password: input.password,
                    startDate: input.startDate || new Date(),
                    createdById: ctx.user!.id,
                },
                include: {
                    createdBy: true,
                    participants: {
                        include: {
                            user: true
                        }
                    }
                }
            });

            // creatore joina subito torneo
            await ctx.db.tournamentParticipant.create({
                data: {
                    tournamentId: tournament.id,
                    userId: ctx.user!.id
                }
            });

            return tournament;
        }),

    joinTournament: protectedProcedure
        .input(z.object({
            tournamentId: z.string(),
            password: z.string().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            const tournament = await ctx.db.tournament.findUnique({
                where: { id: input.tournamentId },
                include: {
                    participants: true
                }
            });

            if (!tournament) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Tournament not found" });
            }

            // check password se richiesta
            if (tournament.password && tournament.password !== input.password) {
                throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid password" });
            }

            // check se l'utente è già nel torneo
            const alreadyJoined = tournament.participants.some(p => p.userId === ctx.user!.id);
            if (alreadyJoined) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Already joined this tournament" });
            }

            // check se il torneo è pieno
            const maxParticipants = 8;
            if (tournament.participants.length >= maxParticipants) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Tournament is full" });
            }

            // aggiungi partecipante
            const participant = await ctx.db.tournamentParticipant.create({
                data: {
                    tournamentId: input.tournamentId,
                    userId: ctx.user!.id
                },
                include: {
                    user: true
                }
            });

            return participant;
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
                    createdBy: true,
                    participants: {
                        include: {
                            user: true
                        }
                    },
                    games: {
                        include: {
                            leftPlayer: true,
                            rightPlayer: true
                        },
                        orderBy: { startDate: 'asc' }
                    }
                }
            });

            if (!tournament) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Tournament not found" });
            }

            return tournament;
        }),

    // solo il creatore puo startarew il torneo
    startTournament: protectedProcedure
        .input(z.object({
            tournamentId: z.string()
        }))
        .mutation(async ({ ctx, input }) => {
            const tournament = await ctx.db.tournament.findUnique({
                where: { id: input.tournamentId },
                include: {
                    participants: true,
                    games: true,
                }
            });

            if (!tournament) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Tournament not found" });
            }

            if (tournament.createdById !== ctx.user!.id) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Only the creator can start the tournament" });
            }

            if (tournament.games.length > 0) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Tournament already started" });
            }

            const maxParticipants = 8;
            if (tournament.participants.length < maxParticipants) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Tournament is not full" });
            }

            const participantIds = tournament.participants.map(p => p.userId);

            const size = maxParticipants;
            const roundsCount = Math.log2(size);

            let parentRoundGameIds: string[] = [];

            const finalGame = await ctx.db.game.create({
                data: {
                    type: GameType.TOURNAMENT,
                    startDate: new Date(),
                    tournamentId: tournament.id,
                    leftPlayerId: participantIds[0],
                    rightPlayerId: participantIds[1],
                },
                select: { id: true }
            });
            parentRoundGameIds = [finalGame.id];

            // Crea i round dal penultimo al primo, collegando con nextGameId
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
                            type: GameType.TOURNAMENT,
                            startDate: new Date(),
                            tournamentId: tournament.id,
                            leftPlayerId,
                            rightPlayerId,
                            nextGameId
                        },
                        select: { id: true }
                    });
                    newRoundIds.push(created.id);
                }

                parentRoundGameIds = newRoundIds;
            }

            const updatedTournament = await ctx.db.tournament.findUnique({
                where: { id: input.tournamentId },
                include: {
                    participants: {
                        include: { user: true }
                    },
                    games: {
                        include: { leftPlayer: true, rightPlayer: true },
                        orderBy: { startDate: 'asc' }
                    }
                }
            });

            return updatedTournament!;
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
                endDate: g.endDate
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

    getMatchResult: protectedProcedure
        .input(z.object({
            gameId: z.string(),
            leftScore: z.number().int().min(0),
            rightScore: z.number().int().min(0),
        }))
        .mutation(async ({ ctx, input }) => {
            const { gameId, leftScore, rightScore } = input;

            const game = await ctx.db.game.findUnique({
                where: { id: gameId },
                include: {
                    leftPlayer: true,
                    rightPlayer: true,
                }
            });

            if (!game) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Game not found" });
            }
            if (game.type !== GameType.TOURNAMENT) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Not a tournament game" });
            }
            if (game.endDate) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Game already finished" });
            }
            if (leftScore === rightScore) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Tie is not allowed" });
            }

            const winnerId = leftScore > rightScore ? game.leftPlayerId : game.rightPlayerId;

            const finishedGame = await ctx.db.game.update({
                where: { id: gameId },
                data: {
                    leftPlayerScore: leftScore,
                    rightPlayerScore: rightScore,
                    endDate: new Date(),
                },
                include: {
                    leftPlayer: true,
                    rightPlayer: true,
                }
            });

            // nextGame, se esiste
            let parentGame = null as null | typeof finishedGame;
            let filledSide: "left" | "right" | null = null;

            if (finishedGame.nextGameId) {
                const next = await ctx.db.game.findUnique({
                    where: { id: finishedGame.nextGameId },
                    include: {
                        previousGames: { select: { id: true } },
                    }
                });
                if (!next) {
                    throw new TRPCError({ code: "NOT_FOUND", message: "Next game not found" });
                }

                // Determina lo slot: ordina gli id dei due children; il min -> left, max -> right
                if (next.previousGames.length !== 2) {
                    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Malformed bracket (previousGames != 2)" });
                }
                const childIds = next.previousGames.map(g => g.id).sort();
                const isLeft = finishedGame.id === childIds[0];
                const data: any = isLeft ? { leftPlayerId: winnerId } : { rightPlayerId: winnerId };
                filledSide = isLeft ? "left" : "right";

                parentGame = await ctx.db.game.update({
                    where: { id: next.id },
                    data,
                    include: {
                        leftPlayer: true,
                        rightPlayer: true,
                    }
                });
            }

            return {
                game: finishedGame,
                nextGame: parentGame,
                filledSide,
            };
        }),
});