import {router} from './src/pages/_router';
import {createTRPCProxyClient, httpBatchLink} from '@trpc/client';
import superjson from 'superjson';
import type {AppRouter} from '../_shared';
import {authManager} from "./src/tools/AuthManager";

export const api = createTRPCProxyClient<AppRouter>({
	links: [
		httpBatchLink({
			url: '/api/trpc',
			fetch: async (input, init) => {
				const res = await fetch(input, {
					...init,
					credentials: 'include',
				});
				return res;
			},
			// @ts-ignore
			transformer: superjson,
		}),
	],
});

if (process.env.NODE_ENV !== 'development') {
	console.info(`Debug logs are disabled in production`);
	console.debug = function () {
	};
}

window.addEventListener('DOMContentLoaded', () => {
	authManager.init()
	router.init();
});
