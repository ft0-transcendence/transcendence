import { FastifyPluginAsync } from "fastify";
import fastifyPassport from "@fastify/passport";
import {env} from "../../env";

export const publicRoutes: FastifyPluginAsync = async (fastify) => {
	// Authentication----------------------------------------------------------

	fastify.get("/auth/login/google", {
		preHandler: async (req, reply) => {
			const { redirect } = req.query as { redirect?: string };
			if (redirect) {
				req.session.redirectTo = redirect;
			}
		},
		handler: fastifyPassport.authenticate("google", {
			scope: ["profile", "email"],
		})
	});

	fastify.get("/auth/google/callback", {
		preHandler: fastifyPassport.authenticate("google", {
			failureRedirect: "/error",
			session: true,
		}),
		handler: async (req, reply) => {
			const redirectTo = req.session.redirectTo || env.FRONTEND_URL;
			delete req.session.redirectTo;
			reply.redirect(redirectTo);
		}
	});

	fastify.get("/auth/logout", async (request, reply) => {
		request.logout();
		const redirectTo = request.session.redirectTo || env.FRONTEND_URL;
		delete request.session.redirectTo;
		reply.redirect(redirectTo);
	});
	// --------------------------------------------------------------------------
};
