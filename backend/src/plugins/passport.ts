import fp from "fastify-plugin";
import fastifyPassport from "@fastify/passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { env } from "../../env";
import { User } from "@prisma/client";

export const passportPlugin = fp(async (fastify) => {
	const googleCallbackUrl = "/api/auth/google/callback";

	fastify.register(fastifyPassport.initialize());
	fastify.register(fastifyPassport.secureSession());

	fastifyPassport.use(
		"google",
		new GoogleStrategy(
			{
				clientID: env.GOOGLE_CLIENT_ID,
				clientSecret: env.GOOGLE_CLIENT_SECRET,
				callbackURL: googleCallbackUrl,
				scope: ["profile", "email", "openid"],
			},

			/// When the user is logged in, the callback is called with the user's profile and the tokens, which can be saved in the database.
			async (accessToken, refreshToken, profile, done) => {
				const id = profile.id;
				const email = profile.emails?.find((email) => email.verified)?.value;
				if (!id) return done(null, false);

				const user: User = await fastify.prisma.user.upsert({
					where: { id },
					create: {
						id: profile.id,
						email: email!,
						username: profile.displayName!,
						image: profile.photos?.find((photo) => photo.value)?.value,
					},
					update: {
						username: profile.displayName!,
						email: email!,
						image: profile.photos?.find((photo) => photo.value)?.value,
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
