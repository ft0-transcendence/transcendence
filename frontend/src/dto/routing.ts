export abstract class RouteController {
	protected titleSuffix?: string | null = null;
	protected isDestroyed = false;

	protected constructor(titleSuffix: string | null = null) {
		if (titleSuffix){
			this.titleSuffix = titleSuffix;
			document.title = `${document.title} | ${titleSuffix}`;
		}
	}

	abstract init(): void

	protected abstract destroy(): void;

	public destroyIfNotDestroyed(): void {
		if (this.isDestroyed) return;
		this.destroy();
		this.isDestroyed = true;
	}
}

export type Route = {
	path: string;
	view: string; // HTML file path (e.g., views/HomeView.html)
	authRequired?: boolean;

	layout?: string;

	newController: () => RouteController;
	controller?: RouteController | null;
};
