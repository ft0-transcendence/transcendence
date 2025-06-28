import {api} from "../../main";
import {RouteController} from "../types/pages";
import {router} from "./_router";

export class HomeController extends RouteController {
	constructor() {
		super();
		this.titleSuffix = 'Home';
	}

	async preRender(){
		console.log('Home controller pre-render');
		window.router.changeLoadingState(true);
	}

	async render(){
		return /*html*/`
			<div class="text-xl font-mono">
				home view works! ${this.suffix}
			</div>
			<button id="landing_page" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
				Go to landing page
			</button>
		`;
	}

	async postRender(){
		console.log('Home controller post-render');
		this.runTest();

		setTimeout(() => {
			window.router.changeLoadingState(false);
		}, 5000);


		document.querySelector('#landing_page')?.addEventListener('click', this.goToLandingPage);
	}

	async goToLandingPage() {
		router.navigate('/');
	}

	async destroy() {
		document.querySelector('#landing_page')?.removeEventListener('click', this.goToLandingPage);
	}



	async runTest() {
		const response = await api.test.publicGreeting.query({name: "Sasha"});
		console.log("Public Greeting Response", response);

		const response2 = await api.test.secretGreeting.query({name: "Odudniak"});
		console.log("Secret Greeting Response", response2);
	}

}
