import {api} from "../../main";
import {RouteController, ViewController} from "../types/pages";
import {router} from "./_router";
import {authManager} from "../tools/AuthManager";

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
		const userData = authManager.user;



		return /*html*/`
			<div class="flex flex-col grow w-full">
				<div class="grow grid grid-cols-5">
					<div class="flex flex-col text-center col-span-1 items-center">
						<div class="border-b border-b-white/15 flex flex-col gap-8 p-4 w-full items-center">
							<img src="${authManager.userImageUrl}" alt="User image" class="rounded-full w-48 h-48">
							<div class="text-xl font-bold">${userData?.username}</div>
						</div>
						<div class="grow flex flex-col justify-end w-full">
							<button data-route="/" class="route-link bg-blue-500 hover:!bg-blue-700 text-white font-bold py-2 px-4 w-full">
								Go to landing page
							</button>
						</div>
					</div>
					<div class="flex flex-col text-center col-span-4 border-l gap-8 border-l-white/30 p-4">
						<h2 class="font-mono uppercase font-bold text-2xl">Match History</h2>
						<div class="flex flex-col gap-2">
							<span class="animate-bounce text-xl">WIP...</span>
						</div>
					</div>
				</div>
			</div>
		`;
	}

	async postRender(){
		console.log('Home controller post-render');
		this.runTest();

		setTimeout(() => {
			window.router.changeLoadingState(false);
		}, 1000);
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
