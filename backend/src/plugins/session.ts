import fp from "fastify-plugin";
import fastifySession, { MemoryStore, Store } from "@fastify/session";
import { env } from "../../env";
import fastifyCookie from "@fastify/cookie";

export const sessionPlugin = fp(async (fastify) => {
	fastify.register(fastifyCookie);

	const sessionStore = new MemoryStore();

	fastify.register(fastifySession, {
		secret: env.AUTH_SECRET,
		cookie: {
			path: "/",
			secure: env.NODE_ENV === "production",
			maxAge: 60 * 60 * 24 * 7, // 7 days,
		},
		cookieName: 'sessionId',
		store: sessionStore
	});

	fastify.addHook("onRequest", async (request) => {
		// Ignore errors when accessing from http
		// @ts-ignore
		request.connection = request.raw.socket;
	});

	fastify.decorate('sessionStore', sessionStore);
});
