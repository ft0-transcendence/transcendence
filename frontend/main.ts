import {router} from './src/router';
import {createTRPCProxyClient, httpBatchLink} from '@trpc/client';
import superjson from 'superjson';
import type {AppRouter} from '../shared/trpc';

export const getBaseUrl = () => {
	if (typeof window !== "undefined") return "";
	if (process.env.URL) return `https://${process.env.URL.replace(/https?:\/\//, "")}`;
	return `http://localhost:${process.env.PORT ?? 4200}`;
};

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
