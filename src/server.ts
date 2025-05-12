import Fastify from "fastify";
import { env } from "./env";
import { prismaPlugin } from "./plugins/prisma";
import { sessionPlugin } from "./plugins/session";
import { passportPlugin } from "./plugins/passport";
import { publicRoutes } from "./routes/public";
import { protectedRoutes } from "./routes/protected";
import { baseRoutes } from "./routes/base";
import { corsPlugin } from "./plugins/cors";

const fastify = Fastify({
	logger: env.NODE_ENV !== "development" ? true : {
		level: "debug",
		transport: {
			target: "pino-pretty",
			options: {
				colorize: true,
				ignore: "pid,hostname",
				translateTime: "yyyy-mm-dd HH:MM:ss",
			},
		},
	},
	ignoreTrailingSlash: true,
	trustProxy: true,
});
fastify.register(prismaPlugin);

fastify.register(corsPlugin);
fastify.register(sessionPlugin);
fastify.register(passportPlugin);

// API ENDPOINTS
fastify.register(baseRoutes);
fastify.register(publicRoutes, { prefix: "/api" });
fastify.register(protectedRoutes, { prefix: "/api/protected" });

const start = async () => {
	try {
		const port = parseInt(env.PORT || "3000", 10);
		await fastify.listen({ port, host: "0.0.0.0" });
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};

start();
