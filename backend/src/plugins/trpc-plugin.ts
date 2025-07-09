import fp from "fastify-plugin";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "../trpc/root";
import { createTRPCContext } from "../trpc/trpc";


export const trpcPlugin = fp(async (fastify) => {
	// ENABLE TRPC (tRPC)
	fastify.register(fastifyTRPCPlugin, {
		prefix: "/api/trpc",
		trpcOptions: {
			router: appRouter,
			createContext: createTRPCContext
		}
	})
});
