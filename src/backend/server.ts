import Fastify from "fastify";
import {env} from "../env";
import {prismaPlugin} from "./plugins/prisma";
import {sessionPlugin} from "./plugins/session";
import {passportPlugin} from "./plugins/passport"
import {corsPlugin} from "./plugins/cors";
import {serializerCompiler, validatorCompiler} from 'fastify-type-provider-zod';
import fastifyFormbody from "@fastify/formbody";
import {fastifyTRPCPlugin} from "@trpc/server/adapters/fastify";
import {appRouter} from "./trpc/root";
import {createContext, createTRPCContext} from "./trpc/trpc";
import fastifyStatic from "@fastify/static";
import * as path from "path";
import {publicRoutes} from "./routes/public";
import fastifyPassport from "@fastify/passport";

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
	ignoreDuplicateSlashes: true,
	trustProxy: true,
});

fastify.register(corsPlugin);
fastify.register(fastifyFormbody);

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

fastify.register(prismaPlugin);

fastify.register(sessionPlugin);
fastify.register(passportPlugin);

// API ENDPOINTS
fastify.register(fastifyTRPCPlugin, {
	prefix: "/api/trpc",
	trpcOptions: {
		router: appRouter,
		createContext: createTRPCContext
	}
})

fastify.get("/api/auth/google",
	fastifyPassport.authenticate("google", {
		scope: ["profile", "email"],
	})
);

fastify.get("/api/auth/google/callback", {
	preValidation: fastifyPassport.authenticate("google", {
		scope: ["profile", "email"],
	}),
}, async (request, reply) => {
	// TODO: change this hardcoded URL
	reply.redirect('http://localhost:5173/');
});

fastify.get("/api/auth/signout", async (request, reply) => {
	request.logout();
	reply.status(200).send();
});

fastify.register(publicRoutes, {prefix: "/api"});
// fastify.register(protectedRoutes, { prefix: "/api/protected" });

fastify.register(fastifyStatic, {
	root: path.join(__dirname, "..", "frontend"),
	prefix: "/",
})
fastify.get("/", async (request, reply) => {
	reply.type("text/html").sendFile("index.html");
});

const start = async () => {
	try {
		const port = parseInt(env.PORT || "4200", 10);
		await fastify.listen({port, host: "0.0.0.0"});
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};

start();
