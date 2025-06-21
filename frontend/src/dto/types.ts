export abstract class RouteController {
	protected titleSuffix?: string | null = null;

	protected constructor(titleSuffix: string | null = null) {
		if (titleSuffix){
			this.titleSuffix = titleSuffix;
			document.title = `${document.title} | ${titleSuffix}`;

		}
	}

	abstract init(): void
	abstract destroy(): void;
}


export type Route = {
	path: string;
	view: string; // HTML file path (e.g., views/HomeView.html)
	authRequired?: boolean;

	newController: () => RouteController;
	controller?: RouteController | null;
};
