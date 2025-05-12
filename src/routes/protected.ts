import { FastifyPluginAsync } from "fastify";

export const protectedRoutes: FastifyPluginAsync = async (fastify) => {
	fastify.addHook("preHandler", async (request, reply) => {
		if (!request.user) {
			reply.code(401).send({ error: "Not authenticated" });
		}
	});


	fastify.get("/whoami", async (request, reply) => {
		const user = request.user;
		if (!user) return reply.code(401).send("Unauthorized");
		return reply.send(user);
	});
}
