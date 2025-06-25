import {api} from "../../main";
import {RouteController} from "../types/pages";

export class LandingPageController extends RouteController {

	async render() {
		return `
			<div class="text-xl font-mono">
				landing page view works!
			</div>
		`;
	}

	async postRender(){
		console.log('Home controller loaded');
		this.runTest();

		document.querySelector('#login-btn')?.addEventListener('click', () => {
			window.location.href = "/api/auth/google";
		})
	}

	async destroy() {
		console.log('Home controller destroyed');
	}

	async runTest() {
		const response = await api.test.publicGreeting.query({name: "Sasha"});
		console.log("Public Greeting Response", response);
	}

}
