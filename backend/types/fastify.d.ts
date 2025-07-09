import 'fastify';
import '@fastify/session'
import type { Server as IOServer } from 'socket.io';
import {PrismaClient, User} from "@prisma/client";
import {Store, SessionManager, MemoryStore} from "@fastify/session";

declare module 'fastify' {
	interface FastifyInstance {
		prisma: PrismaClient;
		io: IOServer;
		sessionStore: MemoryStore;
	}

	interface FastifyRequest {
		user?: User;
	}

}
