export type Route = {
	path: string;
	view: string; // HTML file path (e.g., views/HomeView.html)
	controller: () => Promise<void>;
};
