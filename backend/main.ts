import Fastify from "fastify";
import { env } from "./env";
import { prismaPlugin } from "./src/plugins/prisma";
import { sessionPlugin } from "./src/plugins/session";
import { passportPlugin } from "./src/plugins/passport"
import { corsPlugin } from "./src/plugins/cors";
import fastifyFormbody from "@fastify/formbody";
import { publicRoutes } from "./src/fastify-routes/public";
import pino from "pino-pretty";
import { setupSocketHandlers } from "./src/socket-io";
import { trpcPlugin as trpcConfiguredPlugin } from "./src/plugins/trpc-plugin";
import path from "path";
import fs from 'fs';
import fastifyStatic from "@fastify/static";
import fastifySocketIO from "@ericedouard/fastify-socket.io";
import { socketAuthSessionPlugin } from "./src/plugins/socketAuthSession";
import { loadActiveGamesIntoCache } from "./src/cache";
import { autoStartTournament } from "./src/trpc/routes/tournament";

const BODY_LIMIT_MB = 10;
export const app = Fastify({
	logger: {
		level: "debug",
		transport: {
			target: "pino-pretty",
			options: {
				colorize: true,
				ignore: "pid,reqId",
				translateTime: "yyyy-mm-dd HH:MM:ss",
			},
		},
		base: {}
	},
	ignoreTrailingSlash: true,
	ignoreDuplicateSlashes: true,
	trustProxy: true,
	disableRequestLogging: true,
	bodyLimit: BODY_LIMIT_MB * 1024 * 1024,
});


app.register(corsPlugin);
app.register(fastifyFormbody);
app.register(prismaPlugin);



// API ENDPOINTS
app.register(publicRoutes, { prefix: "/api" });
app.register(trpcConfiguredPlugin);

app.register(sessionPlugin);

// Socket.IO Plugin
app.register(fastifySocketIO, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
		credentials: true,
	},
})
const START_TIME = Symbol("startTime");

app.addHook("onRequest", (request, reply, done) => {
	(request as any)[START_TIME] = process.hrtime.bigint();
	done();
});

app.addHook("onResponse", (request, reply, done) => {
	const start = (request as any)[START_TIME];
	const ip = request.ip;
	if (env.NODE_ENV === 'development' && request.url?.startsWith((`/api/trpc/user.privateProfile?`))){
		done();
		return;
	}
	if (start) {
		const diff = process.hrtime.bigint() - start;
		const ms = Number(diff / 1_000_000n);
		request.log.info(
			`${ip} - ${request.method} ${request.url} → ${reply.statusCode} (${ms}ms)`
		);
	} else {
		request.log.info(
			`${ip} - ${request.method} ${request.url} → ${reply.statusCode}`
		);
	}
	done();
});

app.register(socketAuthSessionPlugin);
app.register(passportPlugin);

const pathToFrontend = path.join(__dirname, "..", "frontend");
app.log.info(`Checking if frontend exists at ${pathToFrontend}`);
if (fs.existsSync(pathToFrontend)) {
	app.log.info("✅  Serving static files from " + pathToFrontend);

	app.register(fastifyStatic, {
		root: pathToFrontend,
		prefix: '/', // serve frontend from root
		index: 'index.html',
	});

	app.setNotFoundHandler((req, reply) => {
		if (req.raw.url?.startsWith('/api')) {
			reply.code(404).send({ error: 'API route not found' });
		} else {
			reply.type('text/html').sendFile('index.html');
		}
	});
}


// Function to check and auto-start tournaments
async function checkAndStartTournaments() {
	try {
		const now = new Date();
		const tournaments = await app.prisma.tournament.findMany({
			where: {
				status: 'WAITING_PLAYERS',
				startDate: {
					lte: now // startDate is in the past or now
				}
			},
			select: {
				id: true,
				name: true
			}
		});

		for (const tournament of tournaments) {
			try {
				app.log.info(`Auto-starting tournament ${tournament.id} (${tournament.name})`);
				await autoStartTournament(app.prisma, tournament.id);
				app.log.info(`Successfully auto-started tournament ${tournament.id}`);
			} catch (error) {
				app.log.error(`Failed to auto-start tournament ${tournament.id}:`, error);
			}
		}
	} catch (error) {
		app.log.error('Error checking tournaments for auto-start:', error);
	}
}

app.ready().then(() => {
	console.log('Fastify is ready');
	setupSocketHandlers(app.io);
	loadActiveGamesIntoCache(app.prisma, app);

	// Check for tournaments to auto-start every 30 seconds
	setInterval(() => {
		checkAndStartTournaments();
	}, 30000); // 30 seconds

	// Also check immediately on startup
	checkAndStartTournaments();
});

const start = async () => {
	try {
		const port = parseInt(env.PORT || "4200", 10);
		await app.listen({ port, host: "0.0.0.0" });
	} catch (err) {
		app.log.error(err);
		process.exit(1);
	}
};

start();

