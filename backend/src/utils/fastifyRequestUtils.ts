import { env } from "../../env";
import { FastifyRequest } from "fastify/types/request";
import { Request } from "express";
import { app } from "../../main";

const allowedRedirectOrigins = [
	env.FRONTEND_URL,
	env.BACKEND_URL,
]
const ALLOW_ANY_ORIGIN = env.NODE_ENV === "development";



export const getRequestOrigin = (req: FastifyRequest | Request, type: "frontend" | "backend") => {
	const protocol = req.protocol || req.headers["x-forwarded-proto"] || "http";
	const host = req.headers.host;
	const origin = `${protocol}://${host}`;
	app.log.debug(`Requesting from ${origin}. Type: ${type}`);
	if (ALLOW_ANY_ORIGIN || allowedRedirectOrigins.includes(origin)) {
		return origin;
	}
	if (type === 'frontend') {
		return env.FRONTEND_URL;
	}
	return env.BACKEND_URL;
}
