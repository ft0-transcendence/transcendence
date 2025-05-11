import {PrismaClient, User} from "@prisma/client";

declare module 'fastify' {
    export interface FastifyInstance {
        prisma: PrismaClient;
    }
    export interface FastifyRequest {
        user?: User;
    }
}