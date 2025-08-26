import { FastifyPluginAsync } from "fastify";
import fastifyPassport from "@fastify/passport";
import { getRequestOrigin } from "../utils/fastifyRequestUtils";

export const GOOGLE_AUTH_CALLBACK_ENDPOINT = '/api/auth/google/callback';
export const GOOGLE_AUTH_CALLBACK_URL = (origin: string)=>`${origin}${GOOGLE_AUTH_CALLBACK_ENDPOINT}`;

export const publicRoutes: FastifyPluginAsync = async (fastify) => {
	// Authentication----------------------------------------------------------

	fastify.get("/auth/login", {
		handler: fastifyPassport.authenticate("google", {
			scope: ["profile", "email"],
		})
	});

	fastify.get(GOOGLE_AUTH_CALLBACK_ENDPOINT.replace(/^\/api/, ''), {
		preHandler: fastifyPassport.authenticate("google", {
			scope: ["profile", "email"],
		}),
		handler: async (req, reply) => {
			const redirectTo = getRequestOrigin(req, 'frontend');
			reply.redirect(redirectTo);
		}
	});

	fastify.get("/auth/logout", async (req, reply) => {
		req.logout();
		const redirectTo = getRequestOrigin(req, 'frontend');
		reply.redirect(redirectTo);
	});
	// --------------------------------------------------------------------------
};
