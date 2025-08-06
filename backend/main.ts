import Fastify from "fastify";
import {env} from "./env";
import {prismaPlugin} from "./src/plugins/prisma";
import {sessionPlugin} from "./src/plugins/session";
import {passportPlugin} from "./src/plugins/passport"
import {corsPlugin} from "./src/plugins/cors";
import fastifyFormbody from "@fastify/formbody";
import {publicRoutes} from "./src/fastify-routes/public";
import pino from "pino-pretty";
import { setupSocketHandlers } from "./src/socket-io";
import { trpcPlugin as trpcConfiguredPlugin } from "./src/plugins/trpc-plugin";
import path from "path";
import fs from 'fs';
import fastifyStatic from "@fastify/static";
import fastifySocketIO from "@ericedouard/fastify-socket.io";
import {socketAuthSessionPlugin} from "./src/plugins/socketAuthSession";

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



// API ENDPOINTS
fastify.register(publicRoutes, {prefix: "/api"});
fastify.register(trpcConfiguredPlugin);

fastify.register(sessionPlugin);

// Socket.IO Plugin
fastify.register(fastifySocketIO, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
		credentials: true,
	},
})


fastify.register(socketAuthSessionPlugin);
fastify.register(passportPlugin);

const pathToFrontend = path.join(__dirname, "..", "frontend");
console.log(`Checking if frontend exists at ${pathToFrontend}`);
if (fs.existsSync(pathToFrontend)) {
	console.log("✅  Serving static files from " + pathToFrontend);

	fastify.register(fastifyStatic, {
		root: pathToFrontend,
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


fastify.ready().then(() => {
	console.log('Fastify is ready');
	setupSocketHandlers(fastify.io);
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
