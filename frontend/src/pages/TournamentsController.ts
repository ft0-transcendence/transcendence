import {RouteController} from "../tools/ViewController";

export class TournamentsController extends RouteController {
	constructor() {
		super();
		this.titleSuffix = 'Tournaments';
	}

	async render() {
		return /*html*/`
			<div class="flex flex-col grow w-full items-center justify-center">
				<h1>tournaments page works!</h1>
			</div>
		`;
	}

	async postRender() {
	}


	async runTest() {
	}

}
