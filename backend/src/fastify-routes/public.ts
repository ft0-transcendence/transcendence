import { FastifyPluginAsync, FastifyReply, RouteHandlerMethod } from "fastify";
import fastifyPassport from "@fastify/passport";
import { env } from "../../env";
import { FastifyRequest } from "fastify/types/request";
import { Request } from "express";
import { CustomGoogleStrategyOptions } from "../utils/CustomGoogleStrategy";

const allowedRedirectOrigins = [
	env.FRONTEND_URL,
	env.BACKEND_URL,
]
const ALLOW_ANY_ORIGIN = env.NODE_ENV === "development";

export const getRequestOrigin = (req: FastifyRequest | Request, type: "frontend" | "backend") => {
	const protocol = req.protocol || req.headers["x-forwarded-proto"] || "http";
	const host = req.headers.host;
	const origin = `${protocol}://${host}`;
	console.log(`Requesting from ${origin}. Type: ${type}`);
	if (ALLOW_ANY_ORIGIN || allowedRedirectOrigins.includes(origin)) {
		return origin;
	}
	if (type === 'frontend') {
		return env.FRONTEND_URL;
	}
	return env.BACKEND_URL;
}

export const publicRoutes: FastifyPluginAsync = async (fastify) => {
	// Authentication----------------------------------------------------------

	fastify.get("/auth/login", {
		handler: async (req, reply) => {
			const { redirect } = req.query as { redirect?: string };
			req.session.redirectTo = redirect || getRequestOrigin(req, 'frontend');
			return (
				fastifyPassport.authenticate("google", {
					scope: ["profile", "email"],
					callbackURL: `${getRequestOrigin(req, 'backend')}/api/auth/google/callback`,
				} as CustomGoogleStrategyOptions) as (req: FastifyRequest, reply: FastifyReply) => RouteHandlerMethod
			)(req, reply);
		}
	});

	fastify.get("/auth/google/callback", {
		handler: async (req, reply) => {
			const redirectTo = req.session.redirectTo || getRequestOrigin(req, 'frontend');
			delete req.session.redirectTo;
			reply.redirect(redirectTo);
		}
	});

	fastify.get("/auth/logout", async (req, reply) => {
		req.logout();

		const redirectTo = req.session.redirectTo || getRequestOrigin(req, 'frontend');
		delete req.session.redirectTo;
		reply.redirect(redirectTo);
	});
	// --------------------------------------------------------------------------
};
