import {api} from "../../main";
import {RouteController} from "../types/pages";

export class HomeController extends RouteController {

	async preRender(){
		console.log('Home controller pre-render');
	}
	async render(){
		return `
			<div class="text-xl font-mono">
				home view works!
			</div>
		`;
	}
	async postRender(){
		console.log('Home controller post-render');
		this.runTest();

		document.querySelector('#login-btn')?.addEventListener('click', () => {
			window.location.href = "/api/auth/google";
		})
	}



	async runTest() {
		const response = await api.test.publicGreeting.query({name: "Sasha"});
		console.log("Public Greeting Response", response);

		const response2 = await api.test.secretGreeting.query({name: "Odudniak"});
		console.log("Secret Greeting Response", response2);
		console.log("T2")
	}

}
