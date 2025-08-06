import fp from "fastify-plugin";
import fastifyPassport from "@fastify/passport";
import { CustomGoogleStrategy } from "../utils/CustomGoogleStrategy";
import { env } from "../../env";
import { User } from "@prisma/client";

export const passportPlugin = fp(async (fastify) => {
	const googleCallbackUrl = env.BACKEND_URL + "/api/auth/google/callback";

	fastify.register(fastifyPassport.initialize());
	fastify.register(fastifyPassport.secureSession());

	fastifyPassport.use(
		"google",
		new CustomGoogleStrategy(
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

				const imageUrl = profile.photos?.find((photo) => photo.value)?.value;


				let imageBlob: Uint8Array | null = null;
				let blobMimeType: string | null = null;
				if (imageUrl) {
					try {
						const response = await fetch(imageUrl);
						const blob = await response.blob();
						blobMimeType = blob.type;
						imageBlob = new Uint8Array(await blob.arrayBuffer());
					} catch (err) {
						console.error('Error fetching image', err);
					}
				}


				const user: User = await fastify.prisma.user.upsert({
					where: { id },
					create: {
						id: profile.id,
						email: email!,
						username: profile.displayName!,
						imageUrl: imageUrl,
						imageBlob: imageBlob,
						imageBlobMimeType: blobMimeType
					},
					update: {
						username: profile.displayName!,
						email: email!,
						imageUrl: imageUrl,
						imageBlob: imageBlob,
						imageBlobMimeType: blobMimeType
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
