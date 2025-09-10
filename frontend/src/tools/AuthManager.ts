import {TRPCClientError} from "@trpc/client";
import {RouterOutputs} from "@shared";
import {api} from "@main";
import { io, Socket } from 'socket.io-client';
import { router } from "@src/pages/_router";

export const AUTH_DOM_IDS = {
	userMenuButton: 'user_menu_button',
	userMenuContainer: 'user_menu_container',

	loggedInUsername: 'logged_in_username',
	loggedInImageUrl: 'logged_in_image_url',
	loggedInContainer: 'logged_in_container',
	loggedOutContainer: 'logged_out_container',
}

export type AuthConfig = typeof AUTH_DOM_IDS;


export class AuthManager {
	// TODO: Remove this. Probably won't be ever used.
	#config: AuthConfig;

	#user: RouterOutputs['user']['getUser'] = null;

	#userRefreshInterval: NodeJS.Timeout | null = null;
	#userRefreshIntervalMs = 1000 * 30;
	#lastCall: Promise<void> | null = null;

	#baseSocketConnection: Socket | null = null;

	constructor(config?: Partial<AuthConfig>) {
		this.#config = {
			userMenuContainer: AUTH_DOM_IDS.userMenuContainer,
			userMenuButton: AUTH_DOM_IDS.userMenuButton,
			loggedInUsername: AUTH_DOM_IDS.loggedInUsername,
			loggedInImageUrl: AUTH_DOM_IDS.loggedInImageUrl,
			loggedInContainer: AUTH_DOM_IDS.loggedInContainer,
			loggedOutContainer: AUTH_DOM_IDS.loggedOutContainer,
			...config,
		};
	}

	get user() {
		return this.#user;
	}
	get userImageUrl() {
		if (!this.#user) return null;
		if (!this.#user.imageBlob) return this.#user.imageUrl;
		const uint8Array = new Uint8Array(this.#user.imageBlob) as unknown as ArrayBuffer;
		const blob = new Blob([uint8Array], { type: this.#user.imageBlobMimeType ?? "image/png" });
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
		// SETTING THE REDIRECT URL BACK TO THE REQUESTOR ORIGIN
		// const redirectUrl = `${window.location.origin}${window.location.pathname}`;
		const apiLoginUrl = `/api/auth/login`;
		window.location.href = apiLoginUrl;
	}

	async logout(){
		window.location.href = '/api/auth/logout';
	}

	#initSocketConnection() {
		if (this.#baseSocketConnection) {
			this.#baseSocketConnection.close();
			this.#baseSocketConnection = null;
		}
		this.#baseSocketConnection = io("/", {
			withCredentials: true,
		});

		this.#baseSocketConnection.on('connect', () => {
			console.debug('Socket connected to server');
		});
		this.#baseSocketConnection.on('disconnect', (reason) => {
			console.debug('Socket disconnected from server.');
			if (router.currentRouteNeedsAuth){
				console.warn("Socket disconnected, supposedly user logged out");
				this.#user = null;
				window.location.href = '/';
				this.#baseSocketConnection = null;
			} else {
				setTimeout(() => {
					this.#initSocketConnection();
				}, 1000);
			}
		});
	}
	public getBaseSocketConnection() {
		if (!this.#baseSocketConnection) {
			this.#initSocketConnection();
		}
		return this.#baseSocketConnection;
	}


	async refreshUser() {
		if (this.#userRefreshInterval) {
			clearTimeout(this.#userRefreshInterval);
		}
		try {
			this.#user = await api.user.getUser.query();
			console.debug('User Refreshed', this.#user);
			if (this.#user && !this.#baseSocketConnection){
				this.#initSocketConnection();
			}
			this.#updateUserFields();
		} catch (err) {
			this.#user = null;
			if (err instanceof TRPCClientError) {
				if (err.data?.code === 'UNAUTHORIZED') {
					console.warn('User not logged in...');
					if (router.currentRouteNeedsAuth){
						router.navigate('/');
					}
				}
			} else {
				console.error('Error refreshing user', err);

			}
		}
		if (this.#user) {
			this.#userRefreshInterval = setTimeout(() => {
				this.#lastCall = this.refreshUser();
			}, this.#userRefreshIntervalMs);
		}
	}

	#updateUserFields() {
		if (!this.#user) return;
		document.querySelectorAll('.user-username').forEach(el => {
			if (el instanceof HTMLElement) {
				el.innerText = this.#user?.username ?? '';
			}
		});
		document.querySelectorAll('.user-image').forEach(el => {
			if (el instanceof HTMLImageElement) {
				el.src = this.userImageUrl ?? '';
				el.alt = this.#user?.username ?? 'user image';
			}
		});

	}
}

export const authManager = new AuthManager();
window.authManager = authManager;
