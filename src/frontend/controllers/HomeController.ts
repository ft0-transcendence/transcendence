import {api} from "../trpc/client";

export default async function HomeController() {
	console.log('Home controller loaded');

	async function runTest() {
		const response = await api.test.publicGreeting.query({name: undefined});
		console.log("Public Greeting Response", response);

		const response2 = await api.test.secretGreeting.query({name: "Odudniak"});
		console.log("Secret Greeting Response", response2);
	}
	runTest();

	document.querySelector('#login-btn')?.addEventListener('click', () => {
		window.location.href = "/api/auth/google";
	})
}
