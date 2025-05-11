import {User} from "@prisma/client";
import {FastifyPluginAsync} from "fastify";

export const baseRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get("/", async (request, reply) => {
        const user = request.user as User | null;
        reply.send(user ? `Hello ${user.username}!` : "Hello world!");
    });
}