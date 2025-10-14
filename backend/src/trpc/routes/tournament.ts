// TODO: da fare join-tournament-game
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, t } from "../trpc";
import { z } from "zod";
import { TournamentType, GameType, TournamentStatus } from "@prisma/client";

export const tournamentRouter = t.router({
    // Getter per mostrare tutti i tornei disponibili
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
                maxParticipants: tournament.type === 'EIGHT',
                hasPassword: !!tournament.password
            }));
        }),

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

    // Getter per ottenere i dettagli di un torneo specifico
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
                maxParticipants: tournament.type === 'EIGHT' ? 8 : 16,
                games: tournament.games,
                hasPassword: !!tournament.password
            };
        }),

    // Funzione per gestire l'avanzamento del torneo quando un game finisce
    handleTournamentAdvancement: protectedProcedure
        .input(z.object({
            gameId: z.string(),
            winnerId: z.string()
        }))
        .mutation(async ({ ctx, input }) => {
            const { gameId, winnerId } = input;

            // Trova il game che è appena finito
            const finishedGame = await ctx.db.game.findUnique({
                where: { id: gameId },
                include: {
                    tournament: true,
                    nextGame: true
                }
            });

            if (!finishedGame || !finishedGame.tournament) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Game or tournament not found" });
            }

            const tournament = finishedGame.tournament;

            // Se c'è un nextGame, aggiorna con il vincitore
            if (finishedGame.nextGame) {
                const nextGame = finishedGame.nextGame;
                
                // Determina se il vincitore va a sinistra o destra nel prossimo game
                const isLeftSide = nextGame.leftPlayerId === finishedGame.leftPlayerId || 
                                 nextGame.leftPlayerId === finishedGame.rightPlayerId;
                
                if (isLeftSide) {
                    await ctx.db.game.update({
                        where: { id: nextGame.id },
                        data: { leftPlayerId: winnerId }
                    });
                } else {
                    await ctx.db.game.update({
                        where: { id: nextGame.id },
                        data: { rightPlayerId: winnerId }
                    });
                }

                // Notifica il prossimo avversario
                const opponentId = isLeftSide ? nextGame.rightPlayerId : nextGame.leftPlayerId;
                if (opponentId) {
                    // Qui potresti aggiungere una notifica socket o email
                    console.log(`🎯 Tournament ${tournament.id}: Player ${winnerId} will face ${opponentId} in next round`);
                }
            } else {
                // È la finale! Il vincitore ha vinto il torneo
                await ctx.db.tournament.update({
                    where: { id: tournament.id },
                    data: {
                        winnerId: winnerId,
                        endDate: new Date(),
                        status: TournamentStatus.COMPLETED
                    }
                });

                console.log(`🏆 Tournament ${tournament.id} completed! Winner: ${winnerId}`);
            }

            return { success: true };
        }),

    // Getter per ottenere i dettagli di un torneo specifico
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
                maxParticipants: tournament.type === 'EIGHT',
                games: tournament.games,
                hasPassword: !!tournament.password
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

                // Determina lo slot: ordina gli id dei due children(uid);
                // in pratica da uid a ogni game e poi lo sorta e mette il min in left e il max in right in modo da avere un bracket consistente(Esempio: vincitore P1 VS P2 andrà slot sinista e vincitore P3 VS P4 andrà slot destro)
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
                    scoreGoal: game.scoreGoal
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
});