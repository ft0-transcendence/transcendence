import {protectedProcedure, publicProcedure, t} from "../trpc";
import {z} from "zod";

export const gameRouter = t.router({
	lastNMatches: protectedProcedure
		.input(z.object({
			quantity: z.number().min(1).max(100).optional().default(20),
		}))
		.query(async ({ input, ctx }) => {
			const { quantity } = input;

			const user = ctx.session.user!;

			const id = user.id;

			const matches = await ctx.db.game.findMany({
				take: quantity,
				orderBy: {
					startDate: 'desc',
				},
				where: {
					OR: [
						{ leftPlayerId: id },
						{ rightPlayerId: id },
					]
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
})
