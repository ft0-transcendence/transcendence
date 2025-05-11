import fp from "fastify-plugin";
import fastifySession from "@fastify/session";
import {env} from "../env";
import fastifyCookie from "@fastify/cookie";

export const sessionPlugin = fp(async (fastify) => {
    fastify.register(fastifyCookie);

    fastify.register(fastifySession, {
        secret: env.AUTH_SECRET,
        cookie: {
            path: "/",
            secure: env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24 * 7, // 7 days,
        },
    });

    fastify.addHook("onRequest", async (request) => {
        // @ts-ignore
        request.connection = request.raw.socket;
    });
});