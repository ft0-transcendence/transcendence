import fp from "fastify-plugin";
import { db } from "../trpc/db";

export const prismaPlugin = fp(async (fastify, options) => {
	fastify.decorate('prisma', db);
})
