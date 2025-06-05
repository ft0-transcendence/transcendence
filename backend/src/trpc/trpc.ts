import {initTRPC, TRPCError} from "@trpc/server";
import {ZodError} from "zod";
import superjson from "superjson";
import {CreateFastifyContextOptions} from "@trpc/server/adapters/fastify";
import {Profile} from "passport-google-oauth20";
import {User} from "@prisma/client";
import {db} from "./db";

export async function createContext() {
	return {};
}

export type TrpcContext = Awaited<ReturnType<typeof createContext>>;

/** @see https://trpc.io/docs/context */
export const createTRPCContext = async (opts: CreateFastifyContextOptions) => {
	const {req, res, info} = opts;

	const user: User | null = req.user as User | null;
	// console.log("TRPC Context user:", req.user); // ✅ Check this in the terminal

	return {
		req,
		res,
		user: user,
		db: db
	}
};


export const t = initTRPC.context<typeof createTRPCContext>().create({
	transformer: superjson,
	errorFormatter({shape, error}) {
		return {
			...shape,
			data: {
				...shape.data,
				zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
			}
		}
	}
});


/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure;

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure.use(({ctx, next}) => {
	if (!ctx.user) {
		throw new TRPCError({ code: "UNAUTHORIZED" });
	}
	return next({
		ctx: {
			// infers the `session` as non-nullable
			session: {...ctx},
		},
	});
});
