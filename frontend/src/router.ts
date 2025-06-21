import {Route} from "./dto/types";
import HomeController from "./controllers/HomeController";
import LandingPageController from "./controllers/LandingPageController";

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
	}
];

const APP_CONTAINER_ID = 'app';
const APP_CONTAINER = document.getElementById(APP_CONTAINER_ID);

class Router {
	private currentRoute: Route | null = null;

	private isLoading = false;

	init() {
		window.addEventListener('popstate', this.route.bind(this));
		this.route();
	}

	route() {
		const route = routes.find(r => r.path === location.pathname);
		if (!route) return this.renderNotFound();
		if (this.currentRoute?.path === route?.path) return;

		const prevRoute = this.currentRoute;
		if (prevRoute?.controller) {
			prevRoute.controller?.destroy();
			prevRoute.controller = null;
		}

		if (route.controller){
			route.controller.destroy();
		}
		route.controller = route.newController();

		this.isLoading = true;
		const res = fetch(route.view);
		res.then(r => r.text()).then(html => {
			APP_CONTAINER.innerHTML = html;
			this.isLoading = false;
			this.currentRoute = route;
			this.currentRoute.controller.init();
		});
	}

	navigate(path: string) {
		history.pushState({}, '', path);
		this.route();
	}

	private renderNotFound() {
		// TODO: cook a 404 page
		APP_CONTAINER.innerHTML = '<h1>404 Not Found</h1>';
	}
}

export const router = new Router();
