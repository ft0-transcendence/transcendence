type Route = {
	path: string;
	view: string; // HTML file path (e.g., views/HomeView.html)
	controller: () => Promise<void>;
};

const routes: Route[] = [
	{
		path: '/',
		view: 'views/HomeView.html',
		controller: () => import('./controllers/HomeController').then(m => m.default()),
	},
];

export const router = {
	async init() {
		window.addEventListener('popstate', this.route.bind(this));
		await this.route();
	},

	async route() {
		const route = routes.find(r => r.path === location.pathname);
		if (!route) return this.renderNotFound();

		const html = await fetch(route.view).then(res => res.text());
		document.body.innerHTML = html;

		await route.controller();
	},

	navigate(path: string) {
		history.pushState({}, '', path);
		this.route();
	},

	renderNotFound() {
		document.body.innerHTML = '<h1>404 Not Found</h1>';
	}
};
