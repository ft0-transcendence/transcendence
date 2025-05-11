import { PrismaClient } from "@prisma/client";
import fp from "fastify-plugin";

export const prismaPlugin = fp(async (server, options)=>{
    const prisma = new PrismaClient();

    await prisma.$connect();

    server.decorate('prisma', prisma);

    server.addHook('onClose', async ()=>{
        await prisma.$disconnect();
    });
})