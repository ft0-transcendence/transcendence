import { User } from "@prisma/client";
import { FastifyPluginAsync } from "fastify";

export const baseRoutes: FastifyPluginAsync = async (fastify) => {
	fastify.get("/", async (request, reply) => {
		const user = request.user as User | null;
		if (user){
			let msg = `Hello ${user.username}!`;
			if (user.image){
				msg += `<img src="${user.image}" style="width: 100px; height: 100px;">`;
			}
			reply.type("text/html");
			reply.send(msg);
			return ;
		}
		reply.send("Hello world!");
	});
}
