import { router } from './src/pages/_router';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '../_shared';
import { authManager } from "@tools/AuthManager";
import { initI18n, } from '@tools/i18n';

// CSS IMPORTS
import './src/styles.css'
import 'flag-icons/css/flag-icons.min.css';


export const api = createTRPCProxyClient<AppRouter>({
	links: [
		httpBatchLink({
			url: '/api/trpc',
			fetch: async (input, init) => {
				const res = await fetch(input, {
					...(init as RequestInit),
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
} else {
	const oldDebug = console.debug;
	console.debug = (...args) => {
		const stack = new Error().stack;
		const caller = stack ? stack.split('\n')[2].trim().split(' ')[1] : 'unknown';
		oldDebug.apply(console, [`[DEBUG] ~ ${caller}\n`, ...args]);
	}
}

window.addEventListener('DOMContentLoaded', () => {
	initI18n();
	authManager.init()
	router.init();
});

