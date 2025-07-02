import Fastify from "fastify";
import {env} from "./env";
import {prismaPlugin} from "./src/plugins/prisma";
import {sessionPlugin} from "./src/plugins/session";
import {passportPlugin} from "./src/plugins/passport"
import {corsPlugin} from "./src/plugins/cors";
import {serializerCompiler, validatorCompiler} from 'fastify-type-provider-zod';
import fastifyFormbody from "@fastify/formbody";
import {fastifyTRPCPlugin} from "@trpc/server/adapters/fastify";
import {appRouter} from "./src/trpc/root";
import {createTRPCContext} from "./src/trpc/trpc";
import {publicRoutes} from "./src/fastify-routes/public";
import pino from "pino-pretty";
import fastifyStatic from "@fastify/static";
import * as path from "node:path";
import * as fs from "node:fs";

pino;

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
fastify.register(prismaPlugin);

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);


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

fastify.register(publicRoutes, {prefix: "/api"});

if (fs.existsSync(path.join(__dirname, "..", "frontend"))) {
	console.log("Serving static files from dist/frontend");

	fastify.register(fastifyStatic, {
		root: path.join(__dirname, '../frontend'),
		prefix: '/', // serve frontend from root
		index: 'index.html',
	});

	fastify.setNotFoundHandler((req, reply) => {
		if (req.raw.url?.startsWith('/api')) {
			reply.code(404).send({ error: 'API route not found' });
		} else {
			reply.type('text/html').sendFile('index.html');
		}
	});
}

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
