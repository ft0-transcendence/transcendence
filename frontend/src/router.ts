import {Route} from "./dto/types";

const routes: Route[] = [
	{
		path: '/',
		view: '/views/HomeView.html',
		controller: () => import('./controllers/HomeController').then(m => m.default()),
	}
];

const APP_CONTAINER_ID = 'app';
const APP_CONTAINER = document.getElementById(APP_CONTAINER_ID);

export const router = {
	async init() {
		window.addEventListener('popstate', this.route.bind(this));
		await this.route();
	},

	async route() {
		const route = routes.find(r => r.path === location.pathname);
		if (!route) return this.renderNotFound();

		const res = await fetch(route.view);
		const html = await res.text();
		APP_CONTAINER.innerHTML = html;

		await route.controller();
	},

	navigate(path: string) {
		history.pushState({}, '', path);
		this.route();
	},

	renderNotFound() {
		APP_CONTAINER.innerHTML = '<h1>404 Not Found</h1>';
	}
};
