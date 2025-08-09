import {api} from "../../main";
import {RouteController} from "../tools/ViewController";
import {router} from "./_router";
import {authManager} from "../tools/AuthManager";
import toast from "../tools/Toast";

export class HomeController extends RouteController {
	constructor() {
		super();
		this.titleSuffix = 'Home';
	}

	async preRender(){
		console.log('Home controller pre-render');
	}

	async render(){
		const userData = authManager.user;



		return /*html*/`
			<div class="flex flex-col w-full grow">
				<div class="flex flex-col items-center w-full grow lg:grid lg:grid-cols-5">
					<div class="flex flex-col items-center w-full text-center lg:h-full lg:col-span-1">
						<div class="flex flex-col items-center w-full gap-8 p-4 border-b border-b-white/15">
								<img src="${authManager.userImageUrl}" alt="User image" class="w-48 h-48 sm:w-32 sm:h-32 rounded-full aspect-square shrink-0">
								<div class="text-xl font-bold">${userData?.username}</div>
						</div>
						<div class="flex flex-col justify-end w-full grow">

						</div>
					</div>
					<div class="flex flex-col w-full gap-8 p-4 text-center  lg:h-full lg:col-span-4 lg:border-l lg:border-l-white/30">
						<h2 class="font-mono text-2xl font-bold uppercase">Match History</h2>
						<div class="flex flex-col gap-2">
							<span class="text-xl animate-bounce">WIP...</span>
						</div>
					</div>
				</div>
			</div>
		`;
	}

	async postRender(){
		console.log('Home controller post-render');
		this.runTest();
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
