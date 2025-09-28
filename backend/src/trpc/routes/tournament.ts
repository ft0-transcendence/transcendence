// backend/src/trpc/routes/tournament.ts
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, t } from "../trpc";
import { z } from "zod";
import { TournamentType } from "@prisma/client";

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
                    pariticipants: {
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
                    pariticipants: true
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
            const alreadyJoined = tournament.pariticipants.some(p => p.userId === ctx.user!.id);
            if (alreadyJoined) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Already joined this tournament" });
            }

            // check se il torneo è pieno
            const maxParticipants = tournament.type === TournamentType.EIGHT ? 8 : 16;
            if (tournament.pariticipants.length >= maxParticipants) {
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
                    pariticipants: {
                        include: {
                            user: true
                        }
                    },
                    _count: {
                        select: {
                            pariticipants: true
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
                    pariticipants: {
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
                    pariticipants: true
                }
            });

            if (!tournament) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Tournament not found" });
            }

            if (tournament.createdById !== ctx.user!.id) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Only the creator can start the tournament" });
            }

            const maxParticipants = tournament.type === TournamentType.EIGHT ? 8 : 16;
            if (tournament.pariticipants.length < maxParticipants) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Tournament is not full" });
            }

            // TODO: implementare logica per generare bracket
            const updatedTournament = await ctx.db.tournament.update({
                where: { id: input.tournamentId },
                data: {
                    startDate: new Date()
                },
                include: {
                    pariticipants: {
                        include: {
                            user: true
                        }
                    }
                }
            });

            return updatedTournament;
        })
});