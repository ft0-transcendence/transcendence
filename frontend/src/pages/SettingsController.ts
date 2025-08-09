import {api} from "../../main";
import {RouteController, ViewController} from "../tools/ViewController";

export class SettingsController extends RouteController {

	constructor() {
		super();
		this.titleSuffix = 'Settings';
	}

	async render() {
		return /*html*/`
			<div class="flex flex-col grow w-full items-center justify-center">
				<h1>settings page works!</h1>
			</div>
		`;
	}

	async postRender(){
	}


	async runTest() {
	}

}
