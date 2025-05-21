import { User } from "@prisma/client";
import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

// USE FastifyPluginAsyncZod to get type safe routes
export const baseRoutes: FastifyPluginAsyncZod = async (fastify) => {

	// STANDARD FASTIFY ROUTE
	fastify.get("/", async (request, reply) => {
		const user = request.user as User | null;
		if (user) {
			let msg = `Hello ${user.username}!`;
			if (user.image) {
				msg += `<img src="${user.image}" style="width: 100px; height: 100px;">`;
			}
			reply.type("text/html");
			reply.send(msg);
			return;
		}
		reply.send("Hello world!");
	});

	// TYPESAFE ROUTE WITH ZOD
	fastify.route({
		url: "/",
		method: "POST",
		schema: {
			// This is the schema for the request body. Use Zod to define the shape of the request body. If it's not valid, the server will return a 400 error with a specific error message.
			body: z.object({
				age: z.number().min(18, "You must be 18 or older to use this route").optional(),
				email: z.string().email().optional()
			}),
			// You can also set the response schema, query schema, and params schema.

		},
		handler: async (request, reply) => {
			request.body.age; // TYPESAFE

			return reply.send(`Hello, you are ${request.body.age} years old! Your email is ${request.body.email}`);
		}
	})
}
