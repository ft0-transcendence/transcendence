import { router } from "@src/pages/_router";
import toast from "@src/tools/Toast";
import { RouteController } from "@src/tools/ViewController";
import { io, Socket } from "socket.io-client";

export class OnlineMatchmakingController extends RouteController {

	#matchmakingSocket: Socket;

	constructor(){
		super();
		this.#matchmakingSocket = io('/matchmaking', {
			withCredentials: true,
		});
		this.#matchmakingSocket.on('connect', () => {
			console.debug('Matchmaking Socket connected to server');
		});
	}

	async preRender() {

		// this.#matchmakingSocket.removeAllListeners();
	}

	async render() {
		return /*html*/`
			<div class="flex flex-col">
				<h2>Looking for a match...</h2>

				<div id="${this.id}-match-found-container" class="hidden">
					<h3>Match found!</h3>
					<p>
						game_id: <span id="${this.id}-game-id"></span>
					</p>
				</div>

				<div id="${this.id}-redirect-timer" class="hidden flex-col">
					Redirecting to the match in <span id="${this.id}-redirect-timer-value">5</span> seconds...
				</div>
			</div>
		`;
	}


	#redirectTimerDiv: HTMLDivElement | null = null;
	#redirectTimerValueSpan: HTMLSpanElement | null = null;
	#animateRedirectTimerTimeout: NodeJS.Timeout | null = null;
	#animateRedirectTimer(end_date: Date, onResolveCb: () => void) {
		if (!this.#redirectTimerDiv || !this.#redirectTimerValueSpan){
			return;
		}
		if (this.#animateRedirectTimerTimeout){
			clearTimeout(this.#animateRedirectTimerTimeout);
		}
		const redirectTimerValue = end_date.getTime() - Date.now();
		this.#redirectTimerValueSpan.innerText = "" + Math.ceil(redirectTimerValue / 1000);
		if (redirectTimerValue <= 0){
			// this.#redirectTimerDiv.classList.add('hidden');
			// this.#redirectTimerDiv.classList.remove('flex');
			onResolveCb();
			return;
		}
		this.#redirectTimerDiv.classList.remove('hidden');
		this.#redirectTimerDiv.classList.add('flex');
		this.#animateRedirectTimerTimeout = setTimeout(()=>{
			this.#animateRedirectTimer(end_date, onResolveCb);
		}, 1000);
	}

	async postRender() {
		this.#matchmakingSocket.emit('join-matchmaking');

		const matchFoundContainer = document.getElementById(`${this.id}-match-found-container`)!;
		const gameIdSpan = document.getElementById(`${this.id}-game-id`)!;

		this.#redirectTimerDiv = document.getElementById(`${this.id}-redirect-timer`)! as HTMLDivElement;
		this.#redirectTimerValueSpan = document.getElementById(`${this.id}-redirect-timer-value`)! as HTMLSpanElement;

		this.#matchmakingSocket.on('match-found', (data) => {
			console.log('Match found', data);
			this.#matchmakingSocket?.close();
			matchFoundContainer.classList.remove('hidden');
			gameIdSpan.innerText = data.gameId;

			const timeLeft = new Date(Date.now() + 3000);
			this.#animateRedirectTimer(timeLeft, () => {
				router.navigate(`/play/online/1v1/${data.gameId}`);
			});
		});

		this.#matchmakingSocket.on('error', (data) => {
			console.debug('Error', data);
			toast.error('Error', data);

			router.navigate('/play');
		});
	}

	protected async destroy() {
		if (this.#matchmakingSocket.connected){
			this.#matchmakingSocket.close();
			console.debug('Cleaning up matchmaking socket');
		}
	}

}
