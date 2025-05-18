import "dotenv/config";
import { z } from "zod";

//!ENV VARS + VALIDATION

const envSchema = z.object({
	AUTH_SECRET: z.string(),
	PORT: z.string().optional(),

	DATABASE_URL: z.string(),

	GOOGLE_CLIENT_ID: z.string(),
	GOOGLE_CLIENT_SECRET: z.string(),

	SKIP_ENV_VALIDATION: z.boolean().optional(),

	NODE_ENV: z.enum(["development", "production"]).optional().default("development"),
});

type Env = z.infer<typeof envSchema>;

let _env: Env;
if (!process.env.SKIP_ENV_VALIDATION) {
	const parsedEnv = envSchema.safeParse(process.env);
	if (parsedEnv.success) {
		_env = parsedEnv.data;
	} else {
		console.error("Error parsing environment variables:", parsedEnv.error);
		throw new Error("Error parsing environment variables");
	}
} else {
	_env = ({ ...process.env as any } as Env)!;
}

export const env = _env;
