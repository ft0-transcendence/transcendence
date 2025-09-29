import { createTRPCRouter, t } from "./trpc";
import { testRouter } from "./routes/test";
import { userRouter } from "./routes/user";
import { friendshipRouter } from "./routes/friendship";
import { tournamentRouter } from "./routes/tournament";
import { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { gameRouter } from "./routes/game";


/**
 * This is the primary router for your server.
 *
 * All routers added in ./routers folder should be manually added here.
 */
export const appRouter = createTRPCRouter({
	test: testRouter,
	user: userRouter,
	tournament: tournamentRouter,
	friendship: friendshipRouter,
	game: gameRouter,
})

export type AppRouter = typeof appRouter;
export const createCaller = t.createCallerFactory(appRouter);

export type RouterInputs = inferRouterInputs<AppRouter>;

export type RouterOutputs = inferRouterOutputs<AppRouter>;
