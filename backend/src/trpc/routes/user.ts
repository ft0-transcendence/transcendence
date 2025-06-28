import {protectedProcedure, t} from "../trpc";

export const userRouter = t.router({
	getUser: protectedProcedure
		.query(async ({ctx}) => {
			const user = await ctx.db.user.findFirst({
				where: {
					id: ctx.user!.id,
				},
			});
			return user;
		}),
})
