import {t} from "../trpc";

export const userRouter = t.router({
	getUser: t.procedure
		.query(async ({ctx}) => {
			return ctx.user;
		}),
})
