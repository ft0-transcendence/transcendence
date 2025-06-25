import {CONSTANTS} from "../pages/_router";

export abstract class RouteController {
	// @ts-ignore
	#isDestroyed = false;
	protected suffix: string | null = null;

	protected get isDestroyed() {
		return this.#isDestroyed;
	}

	constructor() {
	}

	/**
	 * Sets the title suffix of the page. This is used to set the title of the page to include the BASE APP TITLE and the current page's title suffix.
	 * @param titleSuffix The title suffix to set.
	 */
	set titleSuffix(titleSuffix: string | null) {
		if (titleSuffix){
			document.title = `${CONSTANTS.APP_TITLE} | ${titleSuffix}`;
		} else {
			document.title = `${CONSTANTS.APP_TITLE}`;
		}
		this.suffix = titleSuffix;
	}

	// METHODS TO IMPLEMENT IN EXTENDING CLASS
	/**
	 * Called before the view is rendered. Useful for initializing the data needed for the view (e.g., fetching data from the server).
	 * @note This method is optional and can be left empty in the child class.
	 */
	protected async preRender(): Promise<void> {};

	/**
	 * This method returns the HTML of the view. It can be a string, an HTML element, or null.
	 * @note All the pages should implement this method.
	 */
	protected abstract render(): Promise<string | HTMLElement | null>;

	/**
	 * Called after the view is rendered. Useful for binding event listeners.
	 * @note This method is optional and can be left empty in the child class.
	 */
	protected async postRender(): Promise<void> {};

	/**
	 * Called when the controller is destroyed. Useful for cleaning up resources.
	 * @note This method is optional and can be left empty in the child class.
	 */
	protected async destroy(): Promise<void> {};


	//  METHODS TO NOT TO TOUCH -----------------------------------------------
	/**
	 * Destroys the controller if it has not been destroyed yet.
	 * @note This method is called automatically by the router.
	 */
	public async destroyIfNotDestroyed() {
		if (this.#isDestroyed) return;
		await this.destroy();
		this.#isDestroyed = true;
	}

	/**
	 * Renders the view of the controller.
	 * @param parentContainerID The ID of the parent container to render the view in. If not provided, the view is rendered in the body of the document (warning: this can cause issues with nested views, don't do it).
	 * @note This method is called automatically by the router.
	 */
	public async renderView(parentContainerID: string | null = CONSTANTS.APP_CONTAINER_ID){
		await this.preRender();

		const view = await this.render();

		let container: HTMLElement | null = null;

		if (parentContainerID){
			container = document.getElementById(parentContainerID);
			if (!container){
				console.error(`Parent container with ID '#${parentContainerID}' not found`);
				return null;
			}
		}
		else {
			container = document.body;
		}
		if (view instanceof HTMLElement){
			container.innerHTML = '';
			container.appendChild(view);
		} else {
			container.innerHTML = view;
		}

		await this.postRender();

		return view;
	}
}

export type Route = {
	path: string;
	authRequired?: boolean;

	layout?: string;

	newController: () => RouteController;


	// DO NOT TOUCH
	controller?: RouteController | null;
};
