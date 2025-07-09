import fp from 'fastify-plugin';
import { parse as parseCookie } from 'cookie';
import { Signer } from '@fastify/cookie';
import { env } from '../../env';
import { TypedSocket } from '../socket-io';

/**
 * This plugin adds a `user` property to the socket.io `socket` object and forces the socket to be authenticated.
 * The `user` property is a `User` object from the database.
 */
export const socketAuthSessionPlugin = fp(async (fastify) => {
	const signer = new Signer(env.AUTH_SECRET);

	fastify.io.use((socket: TypedSocket, next) => {
		try {
			const rawCookieHeader = socket.handshake.headers.cookie;
			if (!rawCookieHeader) return next(new Error('Missing cookie header'));

			const cookies = parseCookie(rawCookieHeader);
			const cookieName = 'sessionId';
			const sessionCookie = cookies[cookieName];
			if (!sessionCookie) return next(new Error('Missing session cookie'));

			// Unsign cookie
			const unsigned = signer.unsign(sessionCookie);
			if (!unsigned.valid) return next(new Error('Invalid session cookie signature'));

			const sessionId = unsigned.value;

			const sessionStore = fastify.sessionStore;
			if (!sessionStore) return next(new Error('Session store not found'));

			sessionStore.get(sessionId, async (err, session) => {
				if (err || !session) {
					console.error('Failed to load session:', err);
					return next(new Error('Unauthorized'));
				}

				const userId = session.passport;
				if (!userId) {
					console.error('Session user ID not found');
					return next(new Error('Unauthorized'));
				}

				const user = await fastify.prisma.user.findFirst({
					where: {
						id: userId,
					},
				});

				if (!user) {
					console.error('Session user not found');
					return next(new Error('Unauthorized'));
				}

				socket.data.user = user;
				next();
			});
		} catch (err) {
			console.error('Socket.IO session auth error:', err);
			next(new Error('Unauthorized'));
		}
	});
});
