import { api } from "../../main";
import { RouteController, ViewController } from "@tools/ViewController";

export class LandingPageController extends RouteController {

	async render() {
		return /*html*/`
			<div class="flex flex-col grow w-full items-center justify-center">
				<h1> Pong Game</h1>
			</div>
		`;
	}

	async postRender() {
		console.log('Landing page controller loaded');
		this.runTest();

		document.querySelector('#login-btn')?.addEventListener('click', () => {
			window.location.href = "/api/auth/google";
		})
	}


	async runTest() {
		const response = await api.test.publicGreeting.query({ name: "Sasha" });
		console.log("Public Greeting Response", response);
	}

}
