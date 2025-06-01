import { FastifyPluginAsync } from "fastify";
import fastifyPassport from "@fastify/passport";
import {env} from "../../env";

export const publicRoutes: FastifyPluginAsync = async (fastify) => {
	// Authentication----------------------------------------------------------

	fastify.get("/auth/google",
		fastifyPassport.authenticate("google", {
			scope: ["profile", "email"],
		})
	);

	fastify.get("/auth/google/callback", {
		preValidation: fastifyPassport.authenticate("google", {
			scope: ["profile", "email"],
			failureRedirect: `/api/auth/google`,
		}),
	}, async (request, reply) => {
		reply.redirect(env.FRONTEND_URL);
	});

	fastify.get("/api/auth/signout", async (request, reply) => {
		request.logout();
		reply.status(200).send();
	});
	// --------------------------------------------------------------------------
};
