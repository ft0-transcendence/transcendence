import {defineConfig} from 'vite';
import {resolve} from "path";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
	root: './frontend',
	build: {
		outDir: '../../dist/frontend',
		emptyOutDir: true,
	},
	resolve: {
		alias: {
			'@shared': resolve(__dirname, 'src', 'shared'),
		},
	},
	publicDir: './public',
	server: {
		port: 5173,
		proxy: {
			'/api': 'http://localhost:4200', // proxy API to Fastify
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
