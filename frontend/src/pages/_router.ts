import {Route, ViewController} from "../types/pages";
import { HomeController } from "./HomeController";
import { LandingPageController } from "./LandingPageController";
import {BaseLayout} from "../layouts/BaseLayout";

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
	},
	{
		path: '/',
		newController: () => new LandingPageController(),
		newLayout: () => new BaseLayout(),
	}
];


export class AppRouter {
	#APP_CONTAINER: HTMLElement;

	private currentRoute: Route | null = null;
	private currentController: ViewController | null = null;
	private currentLayout: ViewController | null = null;

	private activeTrueLoadingRequests: true[] = [];
	private isLoading = false;


	constructor() {
		const container = document.getElementById(CONSTANTS.APP_CONTAINER_ID);
		if (!container) {
			throw new Error(`Container with ID '${CONSTANTS.APP_CONTAINER_ID}' not found. You need to add it to your index.html file.`);
		}
		this.#APP_CONTAINER = container;
	}

	init() {
		window.addEventListener('popstate', this.route.bind(this));
		this.route();
	}


	private async route() {
		try {
			const pathWithoutHashOrQuery = location.pathname.split('#')[0].split('?')[0];
			const route = routes.find(r => r.path === pathWithoutHashOrQuery);
			if (!route) return this.renderNotFound();

			if (route.path === this.currentRoute?.path) {
				console.debug(`Route is unchanged: ${route.path}`);
				return;
			}

			this.changeLoadingState(true);

			// Cleanup previous controller
			const prevRoute = this.currentRoute;
			this.currentController?.destroyIfNotDestroyed?.();
			this.currentRoute = null;

			this.currentController = route.newController();


			let parentContainerID: string | null = CONSTANTS.APP_CONTAINER_ID;

			if (route.newLayout) {
				parentContainerID = CONSTANTS.APP_LAYOUT_CONTENT_ID;
				if (prevRoute?.newLayout !== route.newLayout) {
					console.debug(`Loading new ${route.newLayout} layout...`);
					await this.currentLayout?.destroyIfNotDestroyed?.();

					this.currentLayout = route.newLayout();
					await this.currentLayout.renderView(CONSTANTS.APP_CONTAINER_ID);
				}
			}

			this.currentRoute = route;
			await this.currentController.renderView(parentContainerID);

		} catch (error) {
			console.error('Routing error:', error);
			this.renderGenericError(error);
		} finally {
			this.changeLoadingState(false);
		}
	}


	public navigate(path: Route['path']) {
		history.pushState({}, '', path);
		this.route();
	}


	public changeLoadingState(isLoading: boolean) {
		const loadingSpinner = document.getElementById(CONSTANTS.LOADING_SPINNER_ID);
		if (!loadingSpinner) {
			console.error(`Loading spinner with ID '${CONSTANTS.LOADING_SPINNER_ID}' not found`);
			return;
		}

		if (isLoading === true) {
			this.activeTrueLoadingRequests.push(isLoading);
		} else {
			this.activeTrueLoadingRequests.shift();
		}

		const newIsLoading = this.activeTrueLoadingRequests.some(r => r === true);

		if (newIsLoading === this.isLoading) return;

		this.isLoading = newIsLoading;

		loadingSpinner.classList.toggle('!hidden', !this.isLoading);
		loadingSpinner.classList.toggle('flex', this.isLoading);
	}

	private renderNotFound() {
		// TODO: cook a 404 page
		this.#APP_CONTAINER.innerHTML = '<h1>404 Not Found</h1>';
	}

	private renderGenericError(error: any) {
		this.#APP_CONTAINER.innerHTML = `
			<div class="flex flex-col items-center justify-center w-full h-full">
				<h1 class="text-red-500">Error</h1>
				<p class="text-red-600">${error}</p>
			</div>
		`;
	}
}

export const router = new AppRouter();
window.router = router;
