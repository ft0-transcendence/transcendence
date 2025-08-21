import { defineConfig } from 'vite';
import { resolve } from "path";
import tailwindcss from "@tailwindcss/vite";
import { env } from "./backend/env";
import path from "path";

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
			'@main': resolve(__dirname, 'frontend/main.ts'),
			'@shared': resolve(__dirname, '_shared'),
			'@src': resolve(__dirname, 'frontend/src'),
			'@tools': resolve(__dirname, 'frontend/src/tools'),
		},
	},
	plugins: [
		tailwindcss(),

		{
			name: 'reload-on-frontend-ts',
			handleHotUpdate({ file, server }) {
				const relativePath = path.relative(process.cwd(), file);
				const isInFrontend = relativePath.startsWith('frontend' + path.sep);

				const validExtensions = ['.ts', '.js', '.html', '.css'];
				const hasValidExtension = validExtensions.some(ext => file.endsWith(ext));

				if (isInFrontend && hasValidExtension) {
					console.log(`[vite] Change detected in ${relativePath}. Triggering full page reload.`);
					server.ws.send({
						type: 'full-reload',
						path: '*',
					});
				}

				return [];
			},
		},
	],
	server: {
		port: 42000,
		proxy: {
			'/api': {
				target: env.BACKEND_URL, // proxy API to Fastify
				changeOrigin: false,
    			xfwd: true,
			},
			'/socket.io': {
				target: env.BACKEND_URL,
				ws: true,
				changeOrigin: true,
			},
			'/socket.io/*': {
				target: env.BACKEND_URL,
				ws: true,
				changeOrigin: true,
			},
		},
		cors: true,
		hmr: true,
		watch: {
		}
	}
});
