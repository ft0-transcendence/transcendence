import {CONSTANTS} from "../pages/_router";
import { updateDOMTranslations } from "../tools/i18n";
import toast from "../tools/Toast";

export abstract class ViewController {
	#id = `${this.constructor.name}-${Math.random().toString(36).substring(2, 15)}`;

	protected type: "page" | "layout" | "component" = "page";
	// @ts-ignore
	#isDestroyed = false;
	protected suffix: string | null = null;

	#childComponents: ViewController[] = [];

	#postRenderCalled = false;


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


	/**
	 * Registers a child component to this controller. Useful so that the children's postRender() method is called after this controller's postRender()
	 * and so that the children's destroy() method is called when this controller is destroyed.
	 * @param child The child component to register.
	 */
	protected registerChildComponent(child: ViewController) {
		this.#childComponents.push(child);
		return child;
	}
	/**
	 * Unregisters a child component from this controller.
	 * @param child The child component to unregister.
	 */
	protected unregisterChildComponent(child: ViewController) {
		this.#childComponents = this.#childComponents.filter(c => c.#id !== child.#id);
		return child;
	}

	//  METHODS TO NOT TO TOUCH -----------------------------------------------
	/**
	 * Destroys the controller if it has not been destroyed yet.
	 * @note This method is called automatically by the router.
	 */
	public async destroyIfNotDestroyed() {
		if (this.#isDestroyed) return;
		await this.destroy();
		this.#isDestroyed = true;
		this.#destroyChildComponents();
	}

	#destroyChildComponents() {
		this.#childComponents.forEach(c => {
			c.destroyIfNotDestroyed()
			.catch(e => console.error('Error destroying child component', e));
		});
		this.#childComponents = [];
	}

	/**
	 * Renders the view of the controller.
	 * @param parentContainerID The ID of the parent container to render the view in. If not provided, the view is rendered in the body of the document (warning: this can cause issues with nested views, don't do it).
	 * @note This method is called automatically by the router.
	 */
	public async renderView(parentContainerID: string | null = CONSTANTS.APP_CONTAINER_ID){
		await this.preRender();
		this.#preRenderAllChildren();

		const view = await this.render();

		let container: HTMLElement | null = null;

		if (parentContainerID){
			container = document.getElementById(parentContainerID);
			if (!container){
				console.error(`Parent container with ID '#${parentContainerID}' not found`);
				toast.error('Error', `Parent container with ID '#${parentContainerID}' for the view '#${this.constructor.name}' not found. Check console for more details.`);
				return null;
			}
		}
		else {
			container = document.body;
		}
		if (view instanceof HTMLElement){
			container.innerHTML = '';
			container.appendChild(view);
			if (!view.id){
				view.id = this.#id;
			}
		} else {
			if (!view){
				console.warn(`Rendering a null view`);
			}
			container.innerHTML = view ?? "";
			const firstChild = container.firstElementChild;
			if (firstChild && !firstChild.id){
				firstChild.id = this.#id;
			}
		}

		if (this.type === "layout") {
			if (!container.querySelector(`#${CONSTANTS.APP_LAYOUT_CONTENT_ID}`)) {
				const msg = `Layout ${this.constructor.name} is missing element with ID '${CONSTANTS.APP_LAYOUT_CONTENT_ID}'`;
				throw new Error(msg);
			}
		}


		await this.postRender();
		this.#postRenderCalled = true;
		this.#postRenderAllChildren();

		updateDOMTranslations(container);

		this.titleSuffix = this.suffix ?? "";

		return view;
	}

	async #preRenderAllChildren() {
		for (const c of this.#childComponents) {
			await c.preRender();
		}
	}

	async #postRenderAllChildren() {
		for (const c of this.#childComponents) {
			c.postRenderOnce();
		}
	}

	public async silentRender() {
		return this.render();
	}

	public async postRenderOnce(){
		if (this.#postRenderCalled){
			toast.warn('PostRender', `The postRender() was called more than once for the view '${this.constructor.name}'. This is probably a bug.`);
			return;
		}
		await this.postRender();
		this.#postRenderCalled = true;
	}


}

export abstract class RouteController extends ViewController {
	constructor() {
		super();
		this.type = "page";
	}
}

export abstract class LayoutController extends ViewController {
	constructor() {
		super();
		this.type = "layout";
	}
}

export abstract class ComponentController extends ViewController {
	constructor() {
		super();
		this.type = "component";
	}
}

export type Route = {
	path: string;
	authRequired?: boolean;

	newLayout?: () => ViewController;
	newController: () => ViewController;
};
