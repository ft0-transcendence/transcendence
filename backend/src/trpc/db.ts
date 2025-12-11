import {env} from "../../env";
import {PrismaClient} from "@prisma/client";

const prismaShowOnlyErrors = !!process.env.PRISMA_SHOW_ONLY_ERRORS;

const createPrismaClient = () =>
	new PrismaClient({
		log:
			env.NODE_ENV === "development" && !prismaShowOnlyErrors ? ["query", "error", "warn"] : ["error"],
	});

const globalForPrisma = globalThis as unknown as {
	prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
