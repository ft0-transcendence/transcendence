import { k, t } from "../tools/i18n";
import { RouteController } from "../types/pages";
// import { io, Socket } from 'socket.io-client';

export class GameSelectorController extends RouteController {
	// #socket: Socket | null = null;

	constructor() {
		super();
		this.updateTitleSuffix();
	}


	override updateTitleSuffix(){
		this.titleSuffix = t('generic.choose_game_mode') || 'Choose a game mode';
	}

	protected async preRender() {
		// this.#socket = io({
		// 	withCredentials: true,
		// });

		// this.#socket.on('connect', () => {
		// 	console.debug('Socket connected to server');

		// });

		// this.#socket!.emit('join-matchmaking');
	}


	async render() {
		return /*html*/`
		<div class="relative flex flex-col sm:grid sm:grid-cols-2 grow w-full px-3 py-2 sm:px-4 sm:py-5">
			<!-- OFFLINE TYPES -->
			<section class="flex flex-col gap-2 min-h-0">
				<div class="justify-center items-center flex gap-2 text-xl sm:text-3xl font-bold text-center">
					<i class="fa fa-chain-broken animate-[spin_4.5s_linear_infinite]" aria-hidden="true"></i>
					<h2 data-i18n="${k('generic.offline')}">OFFLINE</h2>
				</div>
			</section>

			<div class="flex justify-center items-center sm:absolute sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 font-mono sm:h-full grow">
				<div class="absolute w-full h-1 sm:w-1 sm:h-full bg-black/50 animate-pulse"></div>
				<span class="z-10 text-shadow-lg text-shadow-black font-bold text-xl sm:text-2xl text-amber-300 uppercase" data-i18n="${k('generic.or')}">OR</span>
			</div>

			<!-- ONLINE TYPES -->
			<section class="flex flex-col gap-2 min-h-0">
				<div class="justify-center items-center flex gap-2 text-xl sm:text-3xl font-bold text-center">
					<i class="fa fa-wheelchair-alt animate-bounce" aria-hidden="true"></i>
					<h2 data-i18n="${k('generic.online')}">ONLINE</h2>
				</div>
			</section>
		</div>
		`;
	}

	async postRender() {
	}


	protected async destroy() {
		// if (this.#socket) {
		// 	console.debug('Cleaning up socket.io connection');
		// 	// If already connected or connecting, try to disconnect safely
		// 	console.debug('Socket connecting=', this.#socket.connected);

		// 	if (this.#socket.connected) {
		// 		this.#socket.removeAllListeners();
		// 		this.#socket.disconnect();
		// 	} else {
		// 		console.debug('Socket was not connected (yet), forcing close');
		// 		this.#socket.close(); // Force close (does not emit disconnect events)
		// 	}
		// 	this.#socket = null;
		// }
	}

}
