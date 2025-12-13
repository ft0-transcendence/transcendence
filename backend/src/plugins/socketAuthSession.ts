import fp from 'fastify-plugin';
import { parse as parseCookie } from 'cookie';
import { Signer } from '@fastify/cookie';
import { env } from '../../env';
import { TypedSocket } from '../socket-io';
import { Namespace, Server } from 'socket.io';
import { app } from '../../main';
import { TRPCError } from '@trpc/server';

/**
 * This plugin adds a `user` property to the socket.io `socket` object and forces the socket to be authenticated.
 * The `user` property is a `User` object from the database.
 */
export const socketAuthSessionPlugin = fp(async (fastify) => {
	applySocketAuth(fastify.io);
});

export function applySocketAuth(ioOrNamespace: Server | Namespace) {
	const signer = new Signer(env.AUTH_SECRET);

	ioOrNamespace.use(async (socket: TypedSocket, next) => {
		try {
			const rawCookieHeader = socket.handshake.headers.cookie;
			if (!rawCookieHeader) return next(new TRPCError({code:"UNAUTHORIZED", message: "Missing cookie header"}));

			const cookies = parseCookie(rawCookieHeader);
			const sessionCookie = cookies['sessionId'];
			if (!sessionCookie) return next(new TRPCError({code:"UNAUTHORIZED", message: "Missing session cookie"}));

			const unsigned = signer.unsign(sessionCookie);
			if (!unsigned.valid) return next(new TRPCError({code:"UNAUTHORIZED", message: "Invalid session cookie signature"}));

			const sessionId = unsigned.value;
			const sessionStore = app.sessionStore;
			if (!sessionStore) return next(new TRPCError({code:"UNAUTHORIZED", message: "Session store not found"}));

			sessionStore.get(sessionId, async (err, session) => {
				if (err || !session) return next(new TRPCError({code:"UNAUTHORIZED", message: "No session found"}));
				const userId = session.passport;
				if (!userId) return next(new TRPCError({code:"UNAUTHORIZED", message: "No session user found"}));

				const user = await app.prisma.user.findFirst({ where: { id: userId } });
				if (!user) return next(new TRPCError({code:"UNAUTHORIZED", message: "No DB user found"}));

				socket.data.user = user;
				next();
			});
		} catch (err) {
			app.log.error('Error authenticating socket: %s', err);
			next(new TRPCError({code:"UNAUTHORIZED", message: "Unknown error"}));
		}
	});
}
