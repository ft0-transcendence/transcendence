import { LayoutController, RouteController, ViewController } from "@tools/ViewController";
import { HomeController } from "./HomeController";
import { LandingPageController } from "./LandingPageController";
import { NotFoundController } from "./NotFoundController";
import { BaseLayout } from "../layouts/BaseLayout";
import { authManager } from "@tools/AuthManager";
import toast from "@tools/Toast";
import { TournamentsController } from "./TournamentsController";
import { GameSelectorController } from "./play/GameSelectorController";
import { SettingsController } from "./SettingsController";
import { OnlineMatchmakingController } from "./play/online/OnlineMatchmakingController";
import { OnlineVersusGameController } from "./play/online/OnlineVersusGameController";

export type Route = {
	path: string;
	authRequired?: boolean;

	newLayout?: (params?: Record<string, string>) => ViewController;
	newController: (params?: Record<string, string>) => ViewController;
};

export const CONSTANTS = {
	APP_CONTAINER_ID: 'app',
	APP_LAYOUT_CONTENT_ID: 'app_layout_content',
	LOADING_SPINNER_ID: 'loading_spinner',
	APP_TITLE: 'FT0 Transendence',
}

const routes: Route[] = [
	{
		path: '/home',
		newController: () => new HomeController(),
		authRequired: true,
		newLayout: () => new BaseLayout(),
	},
	{
		path: '/',
		newController: () => new LandingPageController(),
		newLayout: () => new BaseLayout(),
	},
	{
		path: '/404',
		newController: () => new NotFoundController(),
		newLayout: () => new BaseLayout(),
	},
	{
		path: '/tournaments',
		newController: () => new TournamentsController(),
		newLayout: () => new BaseLayout(),
	},
	// {
	// 	path: '/tournament/:id',
	// 	newController: () => new TournamentController(),
	// 	newLayout: () => new BaseLayout(),
	// },
	{
		path: '/play',
		newController: () => new GameSelectorController(),
		newLayout: () => new BaseLayout(),
	},
	{
		path: '/play/online/1v1',
		newController: () => new OnlineMatchmakingController(),
		newLayout: () => new BaseLayout(),
		authRequired: true,
	},
	{
		path: '/play/online/1v1/:gameId',
		newController: (params) => new OnlineVersusGameController(params),
		newLayout: () => new BaseLayout(),
		authRequired: true,
	},
	{
		path: '/settings',
		newController: () => new SettingsController(),
		newLayout: () => new BaseLayout(),
		authRequired: true,
	}
];


export class AppRouter {
	#APP_CONTAINER: HTMLElement;

	#currentRoute: Route | null = null;
	#currentController: RouteController | null = null;
	#currentLayout: LayoutController | null = null;

	#activeLoadingCount = 0;
	#isLoading = false;
	#isFirstRoute = true;

	constructor() {
		const container = document.getElementById(CONSTANTS.APP_CONTAINER_ID);
		if (!container) {
			throw new Error(`Container with ID '${CONSTANTS.APP_CONTAINER_ID}' not found. You need to add it to your index.html file.`);
		}
		this.#APP_CONTAINER = container;
	}

	get currentLocation() {
		return this.#currentRoute?.path ?? '/404';
	};
	get currentRouteNeedsAuth() {
		return this.#currentRoute?.authRequired ?? false;
	}

	updateCurrentControllerTitle() {
		if (this.#currentController) {
			this.#currentController.updateTitleSuffix();
		}
	}

	#routeBind = this.#route.bind(this);
	#onGenericClickBind = this.#onGenericClick.bind(this);
	#onGenericMenuClickBind = this.#onGenericMenuClick.bind(this);

	async init() {
		window.removeEventListener('popstate', this.#routeBind);
		window.addEventListener('popstate', this.#routeBind);

		document.body.removeEventListener('click', this.#onGenericClickBind);
		document.body.addEventListener('click', this.#onGenericClickBind);

		document.body.removeEventListener('click', this.#onGenericMenuClickBind);
		document.body.addEventListener('contextmenu', this.#onGenericMenuClickBind);

		// TODO: maybe (?) find a better way to redirect back to the last route after login
		const lastRoute = sessionStorage.getItem('lastRoute');
		const isUserLoggedIn = await authManager.isUserLoggedIn();
		const currentPath = this.#cleanPath(location.pathname);
		if (isUserLoggedIn && lastRoute && currentPath === '/') {
			this.navigate(lastRoute)
		}
		else {
			this.#route();
		}

	}


	#cleanPath(path: string): string {
		return path.split("#")[0].split("?")[0].replace(/\/+$/, "").replace(/\/\//g, "/") || "/";
	}

	#matchRoute(path: string, routePath: string): { matched: boolean; params: Record<string, string> } {
		const pathParts = path.split("/").filter(Boolean);
		const routeParts = routePath.split("/").filter(Boolean);

		if (pathParts.length !== routeParts.length) return { matched: false, params: {} };

		const params: Record<string, string> = {};
		for (let i = 0; i < routeParts.length; i++) {
			if (routeParts[i].startsWith(":")) {
				const key = routeParts[i].slice(1);
				params[key] = decodeURIComponent(pathParts[i]);
			} else if (routeParts[i] !== pathParts[i]) {
				return { matched: false, params: {} };
			}
		}
		return { matched: true, params };
	}

	#findRoute(path: string): { route: Route | null; params: Record<string, string> } {
		for (const r of routes) {
			const result = this.#matchRoute(path, r.path);
			if (result.matched) return { route: r, params: result.params };
		}
		return { route: null, params: {} };
	}

	async #route() {
		try {
			const cleanedPath = this.#cleanPath(location.pathname);
			console.debug("Cleaned path:", cleanedPath);
			const { route, params } = this.#findRoute(cleanedPath);
			console.debug("Route:", route?.path);

			if (!route) {
				console.debug(`Route not found: ${cleanedPath}`);
				window.history.replaceState({}, '', '/404');
				this.#route();
				return;
			}

			// Skip if route and params haven't changed
			if (route.path === this.#currentRoute?.path) {
				const anyParamsDifferent = this.#currentController?.compareParams(params) === "different";
				if (!anyParamsDifferent) {
					console.debug(`Unchanged route: ${route.path}`);
					return;
				}
				console.debug(`Route changed: ${route.path}`);
			}

			this.changeLoadingState(true);

			const isUserLoggedIn = await authManager.isUserLoggedIn();

			if (this.#isFirstRoute && route.path === '/' && isUserLoggedIn) {
				console.debug('Redirecting to home page...');
				this.navigate('/home');
				this.#isFirstRoute = false;
				return;
			}
			this.#isFirstRoute = false;

			if (route.authRequired && !isUserLoggedIn) {
				console.debug('Route requires authentication. Redirecting to login...');
				authManager.login();
				return;
			}



			// Cleanup previous controller
			const prevRoute = this.#currentRoute;
			this.#currentController?.destroyIfNotDestroyed?.();
			this.#currentRoute = null;

			this.#currentRoute = route;
			this.#currentController = route.newController(params);


			let parentContainerID: string | null = CONSTANTS.APP_CONTAINER_ID;

			if (route.newLayout) {
				parentContainerID = CONSTANTS.APP_LAYOUT_CONTENT_ID;
				if (prevRoute?.newLayout?.constructor?.name !== route.newLayout?.constructor.name) {
					console.debug(`Loading new ${route.newLayout} layout...`);
					await this.#currentLayout?.destroyIfNotDestroyed?.();

					this.#currentLayout = route.newLayout();
					await this.#currentLayout.renderView(CONSTANTS.APP_CONTAINER_ID);
				}
			}

			await this.#currentController.renderView(parentContainerID);

		} catch (error) {
			console.error('Routing error:', error);
			if (error instanceof Error) {
				toast.error('Routing Error', error.message);
			} else {
				toast.error('Routing Error', 'An unknown error occurred. Check console for details.');
			}
			this.#renderGenericError(error);

		} finally {
			this.changeLoadingState(false);

			document.querySelectorAll(`.route-link`).forEach(el => el.classList.remove('active'));
			document.querySelector(`.route-link[data-route="${this.currentLocation}"]`)?.classList.add('active');
		}
	}


	public navigate(path: Route['path']) {
		history.pushState({}, '', path);
		sessionStorage.setItem('lastRoute', path);
		this.#route();
	}


	public changeLoadingState(isLoading: boolean) {
		const spinner = document.getElementById(CONSTANTS.LOADING_SPINNER_ID);
		if (!spinner) {
			console.error(`Loading spinner with ID '${CONSTANTS.LOADING_SPINNER_ID}' not found`);
			toast.error('Error', 'Loading spinner not found. Check console for more details.');
			return;
		}

		this.#activeLoadingCount += isLoading ? 1 : -1;
		this.#activeLoadingCount = Math.max(0, this.#activeLoadingCount);


		const newIsLoading = this.#activeLoadingCount > 0;

		if (newIsLoading === this.#isLoading) return;

		this.#isLoading = newIsLoading;

		spinner.classList.toggle('!hidden', !this.#isLoading);
		spinner.classList.toggle('flex', this.#isLoading);
	}

	#renderGenericError(error: unknown) {
		this.#APP_CONTAINER.innerHTML = `
			<div class="flex flex-col items-center justify-center w-full h-full">
				<h1 class="text-red-500">Error</h1>
				<p class="text-red-600">${error}</p>
			</div>
		`;
	}


	#onGenericMenuClick(e: PointerEvent | MouseEvent) {
		const el = (e.target as HTMLElement)?.closest('[data-route]');
		if (el) {
			const dataRoute = el.getAttribute('data-route');
			const isDisabled = el.hasAttribute('disabled');
			if (isDisabled) {
				e.preventDefault();
				e.stopPropagation();
			}
		}
	}

	#onGenericClick(e: PointerEvent | MouseEvent) {
		const el = (e.target as HTMLElement)?.closest('[data-route]');
		if (el) {
			const dataRoute = el.getAttribute('data-route');
			const isDisabled = el.hasAttribute('disabled');
			if (isDisabled) {
				console.debug(`Skipping disabled data-route`, dataRoute);
				return;
			}
			if (dataRoute?.trim()?.length) {
				e.preventDefault();
				this.navigate(dataRoute);
			}
		}
	}
}

export const router = new AppRouter();
window.router = router;
