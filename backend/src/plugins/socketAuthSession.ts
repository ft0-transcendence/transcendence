import fp from 'fastify-plugin';
import { parse as parseCookie } from 'cookie';
import { Signer } from '@fastify/cookie';
import { env } from '../../env';
import { TypedSocket } from '../socket-io';
import { Namespace, Server } from 'socket.io';
import { fastify } from '../../main';

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
			if (!rawCookieHeader) return next(new Error('Missing cookie header'));

			const cookies = parseCookie(rawCookieHeader);
			const sessionCookie = cookies['sessionId'];
			if (!sessionCookie) return next(new Error('Missing session cookie'));

			const unsigned = signer.unsign(sessionCookie);
			if (!unsigned.valid) return next(new Error('Invalid session cookie signature'));

			const sessionId = unsigned.value;
			const sessionStore = fastify.sessionStore;
			if (!sessionStore) return next(new Error('Session store not found'));

			sessionStore.get(sessionId, async (err, session) => {
				if (err || !session) return next(new Error('Unauthorized'));
				const userId = session.passport;
				if (!userId) return next(new Error('Unauthorized'));

				const user = await fastify.prisma.user.findFirst({ where: { id: userId } });
				if (!user) return next(new Error('Unauthorized'));

				socket.data.user = user;
				next();
			});
		} catch (err) {
			console.error('Socket.IO session auth error:', err);
			next(new Error('Unauthorized'));
		}
	});
}
