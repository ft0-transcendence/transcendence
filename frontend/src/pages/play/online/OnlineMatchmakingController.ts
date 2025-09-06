import { router } from "@src/pages/_router";
import toast from "@src/tools/Toast";
import { RouteController } from "@src/tools/ViewController";
import { io, Socket } from "socket.io-client";

export class OnlineMatchmakingController extends RouteController {
	#redirectToGameSeconds = 5;
	#matchmakingSocket: Socket;

	constructor() {
		super();
		this.#matchmakingSocket = io('/matchmaking', {
			withCredentials: true,
		});
		this.#matchmakingSocket.on('connect', () => {
			console.debug('Matchmaking Socket connected to server');
		});
	}

	async preRender() {
	}

	async render() {
		return /*html*/`
			<div class="flex flex-col grow">

				<div id="${this.id}-game-container" class="flex flex-col grow sm:flex-row sm:justify-center w-full">

					<section class="flex flex-col sm:min-w-32 sm:grow">
					</section>

					<section class="flex flex-col grow sm:items-center sm:w-full max-w-2xl">
						<div class="grow flex flex-col w-full">
							<div class="flex flex-col justify-center text-center bg-neutral-950 grow max-w-xl rounded-lg shadow-lg">
								<h2 id="${this.id}-looking-for-match" class="text-3xl font-bold text-amber-400 animate-pulse p-6 uppercase">
									Looking for a match...
								</h2>

								<div id="${this.id}-match-found-container" class="hidden w-full pt-6 px-6 text-center">
									<div class="mb-4">
										<h3 class="text-3xl font-bold text-amber-400 uppercase animate-pulse">Match found!</h3>

										<h3 class="mt-2 text-xl text-amber-400 uppercase font-bold">VS</h3>

										<div class="flex justify-center flex-col overflow-hidden overflow-ellipsis">
											<div class="flex gap-2 items-center justify-center">
												<img id="${this.id}-opponent-image" alt="Opponent image" class="rounded-full object-scale-down h-10 w-10">
												<div id="${this.id}-opponent-username" class="font-semibold text-amber-100"></div>
											</div>
										</div>
									</div>


									<div id="${this.id}-redirect-timer" class="hidden flex-row items-center justify-center text-neutral-300">
										Redirecting in
										<span id="${this.id}-redirect-timer-value" class="font-bold text-2xl text-amber-400 mx-2">5</span>
										seconds...
									</div>
									<p class="text-neutral-300 text-sm italic opacity-50 py-6">
										game_id <span id="${this.id}-game-id" class="font-mono text-amber-300 font-semibold"></span>
									</p>
								</div>
							</div>
						</div>
					</section>
					<section class="hidden sm:flex sm:min-w-32 sm:grow">

					</section>
				</div>
			</div>
		`;
	}

	#redirectTimerDiv: HTMLDivElement | null = null;
	#redirectTimerValueSpan: HTMLSpanElement | null = null;
	#animateRedirectTimerTimeout: NodeJS.Timeout | null = null;
	#animateRedirectTimer(end_date: Date, onResolveCb: () => void) {
		if (!this.#redirectTimerDiv || !this.#redirectTimerValueSpan) {
			return;
		}
		if (this.#animateRedirectTimerTimeout) {
			clearTimeout(this.#animateRedirectTimerTimeout);
		}
		const redirectTimerValue = end_date.getTime() - Date.now();
		this.#redirectTimerValueSpan.innerText = "" + Math.ceil(redirectTimerValue / 1000);
		if (redirectTimerValue <= 0) {
			// this.#redirectTimerDiv.classList.add('hidden');
			// this.#redirectTimerDiv.classList.remove('flex');
			onResolveCb();
			return;
		}
		this.#redirectTimerDiv.classList.remove('hidden');
		this.#redirectTimerDiv.classList.add('flex');
		this.#animateRedirectTimerTimeout = setTimeout(() => {
			this.#animateRedirectTimer(end_date, onResolveCb);
		}, 1000);
	}

	async postRender() {
		this.#matchmakingSocket.emit('join-matchmaking');

		const matchFoundContainer = document.getElementById(`${this.id}-match-found-container`)!;
		const gameIdSpan = document.getElementById(`${this.id}-game-id`)!;

		this.#redirectTimerDiv = document.getElementById(`${this.id}-redirect-timer`)! as HTMLDivElement;
		this.#redirectTimerValueSpan = document.getElementById(`${this.id}-redirect-timer-value`)! as HTMLSpanElement;

		const $lookingForMatch = document.getElementById(`${this.id}-looking-for-match`)! as HTMLDivElement;

		const $opponentImage = document.getElementById(`${this.id}-opponent-image`)! as HTMLImageElement;
		const $opponentUsername = document.getElementById(`${this.id}-opponent-username`)! as HTMLDivElement;

		this.#matchmakingSocket.on('match-found', (data) => {
			console.debug('Match found', data);

			$lookingForMatch.classList.add('hidden');

			const blob = new Blob([data.opponent.imageBlob], { type: data.opponent.imageBlobMimeType });
			$opponentImage.src = URL.createObjectURL(blob);
			$opponentUsername.innerText = data.opponent.username;

			this.#matchmakingSocket?.close();
			matchFoundContainer.classList.remove('hidden');
			gameIdSpan.innerText = data.gameId;

			const timeLeft = new Date(Date.now() + (this.#redirectToGameSeconds * 1000));
			this.#animateRedirectTimer(timeLeft, () => {
				router.navigate(`/play/online/1v1/${data.gameId}`);
			});
		});

		this.#matchmakingSocket.on('error', (data) => {
			console.warn('Error', data);
			toast.error('Error', data);
			this.#matchmakingSocket.emit('leave-matchmaking');
			router.navigate('/play');
		});
	}

	protected async destroy() {
		if (this.#matchmakingSocket.connected) {
			this.#matchmakingSocket.close();
			console.debug('Cleaning up matchmaking socket');
		}
		if (this.#animateRedirectTimerTimeout){
			clearTimeout(this.#animateRedirectTimerTimeout);
		}
	}

}
