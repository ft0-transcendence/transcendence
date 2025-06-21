import {api} from "../../main";
import {RouteController} from "../dto/types";

export class HomeController implements RouteController {

	init() {
		console.log('Home controller loaded');
		this.runTest();

		document.querySelector('#login-btn')?.addEventListener('click', () => {
			window.location.href = "/api/auth/google";
		})
	}

	destroy() {
		console.log('Home controller destroyed');
	}

	async runTest() {
		const response = await api.test.publicGreeting.query({name: "Sasha"});
		console.log("Public Greeting Response", response);

		const response2 = await api.test.secretGreeting.query({name: "Odudniak"});
		console.log("Secret Greeting Response", response2);
		console.log("T2")
	}

}

export default HomeController;
