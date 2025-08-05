import {Route, ViewController} from "../types/pages";
import { HomeController } from "./HomeController";
import { LandingPageController } from "./LandingPageController";
import { NotFoundController } from "./NotFoundController";
import {BaseLayout} from "../layouts/BaseLayout";
import {authManager} from "../tools/AuthManager";
import toast from "../tools/Toast";
import {TournamentsController} from "./TournamentsController";
import {MatchController} from "./MatchController";
import {SettingsController} from "./SettingsController";

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
		path: '/game',
		newController: () => new MatchController(),
		newLayout: () => new BaseLayout(),

	},

	{
		path: '/settings',
		newController: () => new SettingsController(),
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

	private isFirstRoute = true;

	get currentLocation(){
		return this.currentRoute?.path ?? '/404';
	};


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
		document.body.addEventListener('click', (e) => {
			const el = (e.target as HTMLElement)?.closest('.route-link');
			if (el) {
				const dataRoute = el.getAttribute('data-route');
				if (dataRoute?.trim()?.length) {
					e.preventDefault();
					this.navigate(dataRoute);
				}
			}
		});
	}

	private async route() {
		try {
			const pathWithoutHashOrQuery = location.pathname.split('#')[0].split('?')[0];
			const route = routes.find(r => r.path === pathWithoutHashOrQuery);
			if (!route){
				window.history.replaceState({}, '', '/404');
				this.route();
				return;
			}

			if (route.path === this.currentRoute?.path) {
				console.debug(`Route is unchanged: ${route.path}`);
				return;
			}



			this.changeLoadingState(true);

			const isUserLoggedIn = await authManager.isUserLoggedIn();

			if (this.isFirstRoute && route.path === '/' && isUserLoggedIn) {
				console.debug('Redirecting to home page...');
				this.navigate('/home');
				this.isFirstRoute = false;
				return;
			}
			this.isFirstRoute = false;

			if (route.authRequired && !isUserLoggedIn) {
				console.debug('Route requires authentication. Redirecting to login...');
				authManager.login();
				return;
			}



			// Cleanup previous controller
			const prevRoute = this.currentRoute;
			this.currentController?.destroyIfNotDestroyed?.();
			this.currentRoute = null;

			this.currentController = route.newController();


			let parentContainerID: string | null = CONSTANTS.APP_CONTAINER_ID;

			if (route.newLayout) {
				parentContainerID = CONSTANTS.APP_LAYOUT_CONTENT_ID;
				if (prevRoute?.newLayout?.constructor?.name !== route.newLayout?.constructor.name) {
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
			if (error instanceof Error) {
				toast.error('Routing Error', error.message);
			} else {
				toast.error('Routing Error', 'An unknown error occurred. Check console for details.');
			}
			this.renderGenericError(error);

		} finally {
			this.changeLoadingState(false);

			document.querySelectorAll(`.route-link`).forEach(el => el.classList.remove('active'));
			document.querySelector(`.route-link[data-route="${this.currentLocation}"]`)?.classList.add('active');
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
			toast.error('Error', 'Loading spinner not found. Check console for more details.');
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
