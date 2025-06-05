import {protectedProcedure, publicProcedure, t} from "../trpc";
import {z} from "zod";

export const testRouter = t.router({
	publicGreeting: publicProcedure
		.input(z.object({
			name: z.string({required_error: "Name is required"})
		}))
		.query(async ({ input, ctx }) => {
			return "Hello " + input.name + "! This message is just for you. 🤫";
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
