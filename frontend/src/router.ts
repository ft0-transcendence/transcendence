import {Route} from "./dto/routing";
import {HomeController} from "./controllers/HomeController";
import {LandingPageController} from "./controllers/LandingPageController";

const routes: Route[] = [
	{
		path: '/home',
		view: '/views/HomeView.html',
		newController: () => new HomeController(),
		authRequired: true,
	},
	{
		path: '/',
		view: '/views/LandingPageView.html',
		newController: () => new LandingPageController(),
		layout: '/layouts/BaseLayout.html',
	}
];


const CONSTANTS = {
	APP_CONTAINER_ID: 'app',
	APP_LAYOUT_CONTENT_ID: 'app_layout_content',
	LOADING_SPINNER_ID: 'loading_spinner',
}


const APP_CONTAINER = document.getElementById(CONSTANTS.APP_CONTAINER_ID);

export class Router {
	private currentRoute: Route | null = null;
	private isLoading = false;

	init() {
		window.addEventListener('popstate', this.route.bind(this));
		this.route();
	}

	async route() {
		const route = routes.find(r => r.path === location.pathname);
		if (!route) return this.renderNotFound();
		if (this.currentRoute?.path === route?.path) return;

		// Cleanup previous controller
		const prevRoute = this.currentRoute;
		prevRoute?.controller?.destroyIfNotDestroyed?.();
		this.currentRoute = null;

		route.controller?.destroyIfNotDestroyed?.();
		route.controller = route.newController();


		this.updateLoading(true);

		try {
			let layoutHTML = '';
			if (route.layout && prevRoute?.layout !== route.layout) {
				console.debug('Loading layout', route.layout, "...");
				const layoutRes = await fetch(route.layout);
				layoutHTML = await layoutRes.text();
				APP_CONTAINER.innerHTML = layoutHTML;
			}

			console.debug('Loading view', route.view, "...");
			const viewRes = await fetch(route.view);
			const viewHTML = await viewRes.text();

			if (route.layout) {
				const layoutContainer = document.getElementById(CONSTANTS.APP_LAYOUT_CONTENT_ID);
				if (layoutContainer) {
					layoutContainer.innerHTML = viewHTML;
				} else {
					const msg = `Layout ${route.layout} is missing element with ID '${CONSTANTS.APP_LAYOUT_CONTENT_ID}'`;
					console.error(msg);
					this.renderGenericError(msg);
					return;
				}
			} else {
				APP_CONTAINER.innerHTML = viewHTML;
			}

			this.currentRoute = route;
			route.controller.init?.();
		} catch (error) {
			console.error('Routing error:', error);
			this.renderGenericError(error);
		} finally {
			this.updateLoading(false);
		}
	}


	navigate(path: string) {
		history.pushState({}, '', path);
		this.route();
	}

	private updateLoading(isLoading: boolean) {
		this.isLoading = isLoading;
		const loadingSpinner = document.getElementById(CONSTANTS.LOADING_SPINNER_ID);

		if (!loadingSpinner) {
			console.error(`Loading spinner with ID '${CONSTANTS.LOADING_SPINNER_ID}' not found`);
			return;
		}

		loadingSpinner.classList.toggle('!hidden', !isLoading);
		loadingSpinner.classList.toggle('flex', isLoading);
	}

	private renderNotFound() {
		// TODO: cook a 404 page
		APP_CONTAINER.innerHTML = '<h1>404 Not Found</h1>';
	}

	private renderGenericError(error: any) {
		APP_CONTAINER.innerHTML = `
			<div class="flex flex-col items-center justify-center w-full h-full">
				<h1 class="text-red-500">Error</h1>
				<p class="text-red-600">${error}</p>
			</div>
		`;
	}
}

export const router = new Router();
window.router = router;
