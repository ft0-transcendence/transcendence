import { FastifyPluginAsync } from "fastify";
import fastifyPassport from "@fastify/passport";
import { User } from "@prisma/client";

export const publicRoutes: FastifyPluginAsync = async (fastify) => {
	// Authentication----------------------------------------------------------
	fastify.get("/auth/github/callback", {
		preValidation: fastifyPassport.authenticate("github", {}),
	}, async (_, reply) => {
		reply.redirect("/");
	});

	fastify.get("/auth/signout", async (request, reply) => {
		request.logout();
		reply.redirect("/");
	});
	// --------------------------------------------------------------------------
};
