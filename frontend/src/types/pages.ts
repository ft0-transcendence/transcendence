import {CONSTANTS} from "../pages/_router";

export abstract class RouteController {
	// @ts-ignore
	#isDestroyed = false;

	protected get isDestroyed() {
		return this.#isDestroyed;
	}

	constructor() {
	}

	set titleSuffix(titleSuffix: string | null) {
		if (titleSuffix){
			document.title = `${CONSTANTS.APP_TITLE} | ${titleSuffix}`;
		}
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
	public async destroyIfNotDestroyed() {
		if (this.#isDestroyed) return;
		await this.destroy();
		this.#isDestroyed = true;
	}

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
	controller?: RouteController | null;
};
