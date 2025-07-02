import {TRPCClientError} from "@trpc/client";
import {RouterOutputs} from "@shared";
import {api} from "@main";

export type AuthConfig = {
	domSelectors: {
		userMenuContainer: string;
		userMenuButton: string;
		loggedInUsername: string,
		loggedInImageUrl: string,
		loggedInContainer: string,
		loggedOutContainer: string,
	},
}

export const AUTH_DOM_IDS: {
	[key in keyof AuthConfig['domSelectors']]: AuthConfig['domSelectors'][key]
} = {
	userMenuButton: 'user_menu_button',
	userMenuContainer: 'user_menu_container',

	loggedInUsername: 'logged_in_username',
	loggedInImageUrl: 'logged_in_image_url',
	loggedInContainer: 'logged_in_container',
	loggedOutContainer: 'logged_out_container',
}


export class AuthManager {
	#config: AuthConfig;

	#user: RouterOutputs['user']['getUser'] = null;

	#userRefreshInterval: NodeJS.Timeout | null = null;
	#userRefreshIntervalMs = 1000 * 30;
	#lastCall: Promise<void> | null = null;

	constructor(config?: Partial<AuthConfig>) {
		this.#config = {
			domSelectors: {
				userMenuContainer: AUTH_DOM_IDS.userMenuContainer,
				userMenuButton: AUTH_DOM_IDS.userMenuButton,
				loggedInUsername: AUTH_DOM_IDS.loggedInUsername,
				loggedInImageUrl: AUTH_DOM_IDS.loggedInImageUrl,
				loggedInContainer: AUTH_DOM_IDS.loggedInContainer,
				loggedOutContainer: AUTH_DOM_IDS.loggedOutContainer,
			},
			...config,
		};
	}

	get user() {
		return this.#user;
	}
	get userImageUrl() {
		if (!this.#user) return null;
		if (!this.#user.imageBlob) return this.#user.imageUrl;
		const blob = new Blob([this.#user.imageBlob], { type: "image/png" });
		return URL.createObjectURL(blob)
	}

	async isUserLoggedIn() {
		if (this.#lastCall) {
			await this.#lastCall;
		}
		return !!this.#user;
	}

	async init() {
		this.#lastCall = this.refreshUser();
		return this.#lastCall;
	}

	async login(){
		window.location.href = '/api/auth/login';
	}

	async logout(){
		window.location.href = '/api/auth/logout';
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
		if (this.#user) {
			this.#userRefreshInterval = setInterval(() => {
				this.#lastCall = this.refreshUser();
			}, this.#userRefreshIntervalMs);
		}
	}
}


export const authManager = new AuthManager();
window.authManager = authManager;
