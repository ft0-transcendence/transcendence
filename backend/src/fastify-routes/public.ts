import { FastifyPluginAsync } from "fastify";
import fastifyPassport from "@fastify/passport";
import { getRequestOrigin } from "../utils/fastifyRequestUtils";

export const GOOGLE_AUTH_CALLBACK_ENDPOINT = '/api/auth/google/callback';
export const GOOGLE_AUTH_CALLBACK_URL = (origin: string) => `${origin}${GOOGLE_AUTH_CALLBACK_ENDPOINT}`;

export const publicRoutes: FastifyPluginAsync = async (fastify) => {
	// Authentication----------------------------------------------------------

	fastify.get("/auth/login", {
		handler: fastifyPassport.authenticate("google", {
			scope: ["profile", "email"]
		})
	});

	fastify.get(GOOGLE_AUTH_CALLBACK_ENDPOINT.replace(/^\/api/, ''), {
		preHandler: fastifyPassport.authenticate("google", {
			scope: ["profile", "email"],
			failureRedirect: "/api/auth/canceled",
		}),
		handler: async (req, reply,) => {
			const redirectTo = getRequestOrigin(req, 'frontend');
			reply.redirect(redirectTo);
		},

	});

	fastify.get("/auth/canceled", async (req, reply) => {
		const redirectTo = getRequestOrigin(req, 'frontend');
		reply.redirect(redirectTo);
	});


	fastify.get("/auth/logout", async (req, reply) => {
		reply.clearCookie('sessionId');
		try {
			if (req.session) {
				await req.session.destroy();
			}
		} catch (e) {
			fastify.log.warn(e);
		}
		try {
			if (req.session) {
				await req.logOut();
			}
		} catch (e) {
			fastify.log.warn(e);
		}
		const redirectTo = getRequestOrigin(req, 'frontend');
		reply.redirect(redirectTo);
	});
	// --------------------------------------------------------------------------

	fastify.get("/avatar/:userId", { logLevel: 'silent' }, async (req, reply) => {
		const { userId } = req.params as { userId: string | undefined };
		if (!userId || userId?.trim()?.length === 0) {
			reply.status(400).send("Missing userId");
			return;
		}

		const user = await fastify.prisma.user.findFirst({
			where: {
				id: userId,
			}
		});

		if (!user) {
			reply.status(404).send("User not found");
			return;
		}

		const blob = user.imageBlob;
		if (!blob && user.imageUrl) {
			reply.redirect(user.imageUrl);
			return;
		}
		if (!blob) {
			reply.status(404).send("User image not found");
			return;
		}

		reply.type(user.imageBlobMimeType ?? "image/png").send(blob);
	});
};
