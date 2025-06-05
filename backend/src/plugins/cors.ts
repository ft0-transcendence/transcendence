import fp from "fastify-plugin";
import fastifyCors from "@fastify/cors";


export const corsPlugin = fp(async (fastify) => {
	/// ENABLE CORS (Cross-Origin Resource Sharing)
	fastify.register(fastifyCors, {
		origin: "*",
		methods: ["GET", "POST"],
		credentials: true,
	});

});
