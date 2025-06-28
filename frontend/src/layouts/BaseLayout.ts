import {LayoutController, ViewController} from "../types/pages";

export class BaseLayout extends LayoutController {


	async render() {
		return /*html*/`
			<div class="flex flex-col grow w-full bg-neutral-900 text-white">
				<header class="flex items-center h-20 px-4 shadow-xl bg-neutral-950">
				</header>
				<div id="app_layout_content" class="flex grow flex-col w-full"></div>
			</div>
		`;
	}

	async postRender(){
		console.log('Base layout loaded');
	}
}
