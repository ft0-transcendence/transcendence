import fp from "fastify-plugin";
import fastifyCors from "@fastify/cors";
export const corsPlugin = fp(async (fastify) => {
    fastify.register(fastifyCors, {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true,
    });

});
