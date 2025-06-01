import {createTRPCRouter, t} from "./trpc";
import {testRouter} from "./routes/test";

/**
 * This is the primary router for your server.
 *
 * All routers added in ./routers folder should be manually added here.
 */
export const appRouter = createTRPCRouter({
	test: testRouter
})

export type AppRouter = typeof appRouter;
export const createCaller = t.createCallerFactory(appRouter);
