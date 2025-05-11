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

            async (accessToken, refreshToken, profile, done) => {
                const email = profile.emails?.[0]?.value;
                if (!email) return done(null, false);

                const user: User = await fastify.prisma.user.upsert({
                    where: { email },
                    create: {
                        id: profile.id,
                        email,
                        username: profile.username!,
                    },
                    update: {
                        username: profile.username!,
                    },
                });

                done(null, user.id);
            }
        )
    );

    fastifyPassport.registerUserDeserializer(async (id?: string) => {
        const user: User | null = id ? await fastify.prisma.user.findFirst({ where: { id } }) : null;
        return user;
    });

    fastifyPassport.registerUserSerializer(async (id: string) => id);
});
