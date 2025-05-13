import { FastifyPluginAsync } from "fastify";
import fastifyPassport from "@fastify/passport";

export const publicRoutes: FastifyPluginAsync = async (fastify) => {
	// Authentication----------------------------------------------------------
	fastify.get("/auth/github/callback", {
		preValidation: fastifyPassport.authenticate("github", {}),
	}, async (_, reply) => {
		reply.status(200).send({ message: "Successfully authenticated!", userId: _.user });
	});

	fastify.get("/auth/signout", async (request, reply) => {
		request.logout();
		reply.status(200).send();
	});
	// --------------------------------------------------------------------------
};
