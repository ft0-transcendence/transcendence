import {router} from './src/pages/_router';
import {createTRPCProxyClient, httpBatchLink} from '@trpc/client';
import superjson from 'superjson';
import type {AppRouter} from '../_shared';

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

window.addEventListener('DOMContentLoaded', () => {
	router.init();
});
