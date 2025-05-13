import fp from "fastify-plugin";
import fastifyPassport from "@fastify/passport";
import { Strategy as GitHubStrategy } from "passport-github";
import { env } from "../env";
import { User } from "@prisma/client";

export const passportPlugin = fp(async (fastify) => {
	const githubCallbackUrl = "/api/auth/github/callback";

	fastify.register(fastifyPassport.initialize());
	fastify.register(fastifyPassport.secureSession());

	fastifyPassport.use(
		"github",
		new GitHubStrategy(
			{
				clientID: env.GITHUB_CLIENT_ID,
				clientSecret: env.GITHUB_CLIENT_SECRET,
				callbackURL: githubCallbackUrl,
				scope: ["user:email"],
			},

			/// When the user is logged in, the callback is called with the user's profile and the tokens, which can be saved in the database.
			async (accessToken, refreshToken, profile, done) => {
				const id = profile.id;
				const email = profile.emails?.[0]?.value;
				if (!id) return done(null, false);

				const user: User = await fastify.prisma.user.upsert({
					where: { id },
					create: {
						id: profile.id,
						email: email ? email : null,
						username: profile.username!,
					},
					update: {
						username: profile.username!,
						email: email ? email : null,
					},
				});

				done(null, user.id);
			}
		)
	);

	/// The deserializer fetches the user from the database and puts it in the `request` object.
	fastifyPassport.registerUserDeserializer(async (id?: string) => {
		const user: User | null = id ? await fastify.prisma.user.findFirst({ where: { id } }) : null;
		return user;
	});

	/// The serializer serializes the user into the session.
	fastifyPassport.registerUserSerializer(async (id: string) => id);
});
