import { defineConfig } from 'vite';
import { resolve } from "path";
import tailwindcss from "@tailwindcss/vite";
import { env } from "./backend/env";

export default defineConfig({
	root: './frontend',
	publicDir: 'public',

	build: {
		outDir: '../dist/frontend',
		emptyOutDir: true,
		assetsDir: 'public',

	},
	resolve: {
		alias: {
			'@shared': resolve(__dirname, '_shared'),
			'@main': resolve(__dirname, 'frontend/main.ts'),
		},
	},
	server: {
		port: 42000,
		proxy: {
			'/api': env.BACKEND_URL, // proxy API to Fastify
			'/socket.io': {
				target: env.BACKEND_URL,
				ws: true,
				changeOrigin: true,
			}
		},
		cors: true,
		hmr: true,
		watch: {
		}
	},
	plugins: [
		tailwindcss(),
	]
});
