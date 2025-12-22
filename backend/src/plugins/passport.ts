import fp from "fastify-plugin";
import fastifyPassport from "@fastify/passport";
import { CustomGoogleStrategy } from "../utils/CustomGoogleStrategy";
import { env } from "../../env";
import { User } from "@prisma/client";
import { db } from "../trpc/db";
import { app } from "../../main";

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
				// callbackURL: googleCallbackUrl,
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
						app.log.error('Error fetching image', err);
					}
				}

				let user: User | null = null;

				const existingUser = await fastify.prisma.user.findFirst({
					where: { id: profile.id },
				});
				if (existingUser) {
					user = await fastify.prisma.user.update({
						where: { id: profile.id },
						data: {
							email: email!,
						},
					});
				} else {
					const username = await standardizeProfileUsername(profile.displayName!);
					user = await fastify.prisma.user.create({
						data: {
							id: profile.id!,
							email: email!,
							username: username,
							tournamentUsername: username,
							imageUrl: imageUrl,
							imageBlob: imageBlob,
							imageBlobMimeType: blobMimeType
						}
					});
				}

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


async function standardizeProfileUsername(username: string) {

	let parsed = username.toLowerCase().replace(/\s/g, " ").replace(/\s/g, "_").replace(/[^0-9a-zA-Z_]/g, "_").substring(0, 24);
	let foundUser = await db.user.findFirst({
		where: {username: parsed}
	})

	let count = 0;
	let newParsed: string = parsed;
	while (foundUser != null) {
		newParsed = `${newParsed.substring(0, 24 - count.toString().length)}_${count}`;

		if (newParsed.length > 24) {
			if (count.toString().length == 24){
				newParsed = crypto.randomUUID().substring(0, 24);
				break;
			}
			newParsed = `${parsed.substring(0, 24 - count.toString().length)}_${count}`;
		}

		foundUser = await db.user.findFirst({
			where: {username: newParsed}
		})
		count++;
	}

	return newParsed;
}
