import {RouteController} from "../types/pages";

export class MatchController extends RouteController {
	constructor() {
		super();
		this.titleSuffix = 'Play';
	}

	async render() {
		return /*html*/`
			<div class="flex flex-col grow w-full items-center justify-center">
				<h1>match page works!</h1>
			</div>
		`;
	}

	async postRender() {
	}


	async runTest() {
	}

}
