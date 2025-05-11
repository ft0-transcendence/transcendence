import {PrismaClient, User} from "@prisma/client";

declare module 'fastify' {
    interface FastifyInstance {
        prisma: PrismaClient;
    }
    interface FastifyRequest {
        user?: User;
    }
}