import {TRPCClientError} from "@trpc/client";
import {RouterOutputs} from "@shared";
import {api} from "@main";

export type AuthConfig = {
	domSelectors: {
		loggedInUsername: string,
		loggedInImageUrl: string,
		loggedInContainer: string,
		loggedOutContainer: string,
	},
}

export const AUTH_DOM_SELECTORS: {
	[key in keyof AuthConfig['domSelectors']]: AuthConfig['domSelectors'][key]
} = {
	loggedInUsername: '#logged_in_username',
	loggedInImageUrl: '#logged_in_image_url',
	loggedInContainer: '#logged_in_container',
	loggedOutContainer: '#logged_out_container',
}


export class AuthManager {
	#config: AuthConfig;

	#user: RouterOutputs['user']['getUser'] = null;

	#userRefreshInterval: NodeJS.Timeout | null = null;
	#userRefreshIntervalMs = 1000 * 30;

	constructor(config?: Partial<AuthConfig>) {
		this.#config = {
			domSelectors: {
				loggedInUsername: AUTH_DOM_SELECTORS.loggedInUsername,
				loggedInImageUrl: AUTH_DOM_SELECTORS.loggedInImageUrl,
				loggedInContainer: AUTH_DOM_SELECTORS.loggedInContainer,
				loggedOutContainer: AUTH_DOM_SELECTORS.loggedOutContainer,
			},
			...config,
		};
	}

	get user() {
		return this.#user;
	}

	get isLoggedIn() {
		return !!this.#user;
	}

	init() {
		this.refreshUser();
	}


	async refreshUser() {
		if (this.#userRefreshInterval) {
			clearInterval(this.#userRefreshInterval);
		}
		try {
			this.#user = await api.user.getUser.query();
			console.debug('User Refreshed', this.#user);
		} catch (err) {
			this.#user = null;
			if (err instanceof TRPCClientError) {
				if (err.data?.code === 'UNAUTHORIZED') {
					console.warn('User not logged in...');
				}
			} else {
				console.error('Error refreshing user', err);
			}
		}
		if (this.#user){
			this.#userRefreshInterval = setInterval(() => this.refreshUser(), this.#userRefreshIntervalMs);
		}
	}
}


export const authManager = new AuthManager();
window.authManager = authManager;
