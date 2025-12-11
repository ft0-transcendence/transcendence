import {protectedProcedure, publicProcedure, t} from "../trpc";
import {z} from "zod";
import { TRPCError } from "@trpc/server";

export const gameRouter = t.router({

	getActiveGames: protectedProcedure
		.query(async ({ ctx }) => {
			const activeGames = await ctx.db.game.findMany({
				where: { endDate: null, tournamentId: null, nextGameId: null },
				include: {
					leftPlayer: {
						select: {
							id: true,
							username: true,
						}
					},
					rightPlayer: {
						select: {
							id: true,
							username: true,
						}
					}
				}
			})
			return activeGames;
		}),

	lastNMatches: protectedProcedure
		.input(z.object({
			userId: z.string().optional(),
			quantity: z.number().min(1).max(100).optional().default(20),
		}))
		.query(async ({ input, ctx }) => {
			const { quantity } = input;

			const id = input.userId ?? ctx.user!.id;

			const user = await ctx.db.user.findUnique({
				where: { id: id },
				select: {
					id: true,
				}
			});
			if (!user) {
				throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
			}



			const matches = await ctx.db.game.findMany({
				take: quantity,
				orderBy: {
					startDate: 'desc',
				},
				where: {
					OR: [
						{ leftPlayerId: id },
						{ rightPlayerId: id },
					],
					endDate: {
						not: null,
					},
					tournamentId: null,
					nextGameId: null,
				},
				include: {
					leftPlayer: {
						select: {
							id: true,
							username: true,
						}
					},
					rightPlayer: {
						select: {
							id: true,
							username: true,
						}
					}
				}
			});

			const res = matches.map(m => {
				const mySide: "left" | "right" = m.leftPlayerId === id ? 'left' : 'right';
				const winner = m.leftPlayerScore > m.rightPlayerScore ? m.leftPlayer : m.rightPlayer;
				const result: "W" | "L" = winner.id === id ? 'W' : 'L';
				return {
					...m,
					result,
					mySide: mySide
				}
			});

			return res;
		}),
	getTournamentGameDetails: protectedProcedure
		.input(z.object({
			tournamentId: z.string().nonempty(),
			gameId: z.string().nonempty(),
		}))
		.query(async ({ input, ctx }) => {
			const { tournamentId, gameId } = input;
			const user = ctx.session.user!;
			const id = user.id;

			const game = await ctx.db.game.findFirst({
				where: {
					id: gameId,
					tournamentId: tournamentId,
				},
				include: {
					leftPlayer: {
						select: {
							id: true,
							username: true,
						}
					},
					rightPlayer: {
						select: {
							id: true,
							username: true,
						}
					}
				},
			})

			if (!game) {
				// Fastest way to tell if game not found
				return null;
			}

			const isPlayerInGame = game.leftPlayerId === id || game.rightPlayerId === id;

			const mySide: "left" | "right" = game.leftPlayerId === id ? 'left' : 'right';
			const winner = game.leftPlayerScore > game.rightPlayerScore ? game.leftPlayer : game.rightPlayer;
			const result: "W" | "L" = winner.id === id ? 'W' : 'L';

			let obj = isPlayerInGame ? {
				mySide,
				result,
			} : {};

			return {
				...game,
				...obj
			};
		}),
	getVersusGameDetails: protectedProcedure
		.input(z.object({
			gameId: z.string().nonempty(),
		}))
		.query(async ({ input, ctx }) => {
			const { gameId } = input;
			const user = ctx.session.user!;
			const id = user.id;

			const game = await ctx.db.game.findFirst({
				where: {
					id: gameId,
					type: 'VS',
				},
				include: {
					leftPlayer: {
						select: {
							id: true,
							username: true,
						}
					},
					rightPlayer: {
						select: {
							id: true,
							username: true,
						}
					}
				}
			});
			if (!game) {
				// Fastest way to tell if game not found
				return null;
			}

			const isPlayerInGame = game.leftPlayerId === id || game.rightPlayerId === id;

			const mySide: "left" | "right" = game.leftPlayerId === id ? 'left' : 'right';
			const winner = game.leftPlayerScore > game.rightPlayerScore ? game.leftPlayer : game.rightPlayer;
			const result: "W" | "L" = winner.id === id ? 'W' : 'L';

			let obj = isPlayerInGame ? {
				mySide,
				result,
			} : {};

			return {
				...game,
				...obj
			};

		}),
})
