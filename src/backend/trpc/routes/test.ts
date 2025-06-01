import {protectedProcedure, publicProcedure, t} from "../trpc";
import {z} from "zod";

export const testRouter = t.router({
	publicGreeting: publicProcedure
		.input(z.object({
			name: z.string().optional(),
		}))
		.query(async ({ input }) => {
			return {
				greeting: `Hello ${input.name ?? "World"}!`,
			};
		}),
	secretGreeting: protectedProcedure
		.input(z.object({
			name: z.string(),
		}))
		.query(async ({ input }) => {
			return {
				greeting: `Hello ${input.name}! This message is just for you. 🤫`,
			};
		}),
})
