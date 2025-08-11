import { GameType, GameTypeObj } from "@shared";
import { k, t } from "../tools/i18n";
import { RouteController } from "../tools/ViewController";
import { Route } from '../pages/_router'
import { authManager } from "../tools/AuthManager";
// import { io, Socket } from 'socket.io-client';

export class GameSelectorController extends RouteController {
	#isUserLoggedIn = false;

	#onlineModeLoginButton: HTMLElement | null = null;
	// #socket: Socket | null = null;

	constructor() {
		super();
		this.updateTitleSuffix();
	}


	override updateTitleSuffix(){
		this.titleSuffix = t('generic.choose_game_mode') || 'Choose a game mode';
	}

	protected async preRender() {
		this.#isUserLoggedIn = await authManager.isUserLoggedIn();
		// this.#socket = io({
		// 	withCredentials: true,
		// });

		// this.#socket.on('connect', () => {
		// 	console.debug('Socket connected to server');

		// });

		// this.#socket!.emit('join-matchmaking');
	}

	private renderGameMode(gameType: GameType, location: 'online' | 'local', route: `/${string}`, description?: string | null, fa_icon?: string | null) {
		if (!gameType){
			console.error(`Game selector: Invalid game type: ${gameType}`);
			return '';
		}
		const lowercaseGameType: Lowercase<GameType> = gameType.toLowerCase() as Lowercase<GameType>;

		const relativeRoute = `${this.currentRoute}/${lowercaseGameType}` satisfies Route['path'];

		const key = `game_modes.${lowercaseGameType}`;

		const isLoggedIn = location == 'online' && this.#isUserLoggedIn;

		const canClick = isLoggedIn || location == 'local';

		return /*html*/`
			<button ${!canClick? 'disabled' : ''} data-route="${relativeRoute}"
				class="relative flex flex-col justify-center items-center overflow-hidden w-full rounded-lg
				${canClick? `hover:drop-shadow-amber-500 cursor-pointer` : 'cursor-not-allowed hover:drop-shadow-red-900'}
				text-xl sm:text-2xl max-w-2xl gap-2 text-center px-2 py-7 bg-stone-800 drop-shadow-md drop-shadow-black transition-all duration-200"
			>
				<div class="flex items-center gap-2">
					${fa_icon ? /*html*/`<i class="fa ${fa_icon}" aria-hidden="true"></i>` : ''}
					<div class="font-semibold" data-i18n="${key}">${lowercaseGameType}</div>
				</div>
				${description ? /*html*/`<div class="text-sm text-neutral-400">${description}</div>` : ''}
				${!canClick ? /*html*/`<div class="absolute top-0 left-0 w-full h-full bg-black/50 flex items-center justify-center">` : ''}
			</button>
		`;

	}

	private renderLoginButton() {
		return /*html*/`
			<div class="flex flex-col items-center justify-center py-2">
				<h3 class="text-base font-mono animate-pulse text-red-500 text-center" data-i18n="${k('generic.online_mode_login_needed')}">
					You need to login to play online.
				</h3>

				<div class="${this.id}-login-button mt-2 py-3 px-8 border rounded-sm border-white/25 cursor-pointer hover:bg-neutral-800 max-w-md">
					<i class="fa fa-sign-in"></i>
					<span class="grow text-left font-semibold" data-i18n="${k('navbar.login')}">Login</span>
				</div>
			</div>
		`;
	}


	async render() {
		return /*html*/`
		<!--<div class="flex flex-col gap-2 text-center mb-4">
			<h1 class="text-3xl sm:text-4xl font-bold text-center">
				<span data-i18n="${k('generic.choose_game_mode')}">Choose a game mode</span>
			</h1>
		</div>-->
		<div class="relative flex flex-col sm:grid sm:grid-cols-2 grow w-full px-3 py-2 sm:px-0 sm:py-0">


			<!-- OFFLINE TYPES -->
			<section class="flex flex-col gap-2 min-h-0 grow sm:px-12 sm:py-5 ">
				<div class="flex flex-col h-20">
					<div class="justify-center items-center flex gap-2 text-2xl sm:text-3xl font-bold text-center">
						<i class="fa fa-chain-broken animate-[spin_4.5s_linear_infinite]" aria-hidden="true"></i>
						<h2 data-i18n="${k('generic.offline')}">OFFLINE</h2>
					</div>

					<div class="flex flex-col text-center">
						<h2 class="text-xs sm text-gray-400" data-i18n="${k('generic.offline_mode_explanation')}">
							Play on the same computer, without tracking the matches.
						</h2>
					</div>
				</div>

				<!-- GAME MODES: 1vAI, 1v1, tournament -->
				<div class="flex flex-col sm:justify-center sm:items-center gap-7 text-center grow">
					${this.renderGameMode(GameTypeObj.AI, 'local', '/local/ai')}
					${this.renderGameMode(GameTypeObj.VS, 'local', '/local/1v1')}
					${this.renderGameMode(GameTypeObj.TOURNAMENT, 'local', '/local/tournaments', null, 'fa-users')}
				</div>

				<div class="sm:h-20 spanner"></div>
			</section>

			<div class="flex z-10 justify-center items-center sm:absolute sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 font-mono sm:h-full sm:grow">
				<div class="absolute w-full h-1 sm:w-1 sm:h-full bg-black/50 animate-pulse"></div>
				<span class="z-20 text-shadow-lg text-shadow-black font-bold text-xl sm:text-2xl text-amber-300 uppercase" data-i18n="${k('generic.or')}">OR</span>
			</div>

			<!-- ONLINE TYPES -->
			<section class="relative flex flex-col-reverse sm:flex-col gap-2 min-h-0 grow sm:px-12 sm:py-5">
				<div class="flex flex-col-reverse sm:flex-col h-20">
					<div class="justify-center items-center flex gap-2 text-2xl sm:text-3xl font-bold text-center">
						<i class="fa fa-wheelchair-alt animate-bounce" aria-hidden="true"></i>
						<h2 data-i18n="${k('generic.online')}">ONLINE</h2>
					</div>
					<div class="flex flex-col text-center">
						<h2 class="text-xs text-gray-400" data-i18n="${k('generic.online_mode_explanation')}">
							Play on a server, with a matchmaking system and history tracking.
						</h2>
					</div>
				</div>

				<!-- GAME MODES: 1v1, tournament -->
				<div class="relative flex flex-col sm:justify-center sm:items-center gap-2 text-center grow">
					${this.renderGameMode(GameTypeObj.VS, 'online', '/online/1v1')}
					${this.renderGameMode(GameTypeObj.TOURNAMENT, 'online', '/online/tournaments', null, 'fa-users')}
				</div>

				<div class="sm:h-20 spanner">
					${!this.#isUserLoggedIn ? this.renderLoginButton(): ''}
				</div>
			</section>
		</div>
		`;
	}

	async postRender() {
		if (!this.#isUserLoggedIn) {
			this.#onlineModeLoginButton = document.querySelector(`.${this.id}-login-button`);
			if (this.#onlineModeLoginButton){
				this.#onlineModeLoginButton.addEventListener('click', this.onLoginButtonClick.bind(this));
			}
		}
	}

	private async onLoginButtonClick() {
		await authManager.login();
	}


	protected async destroy() {
		if (this.#onlineModeLoginButton){
			this.#onlineModeLoginButton.removeEventListener('click', this.onLoginButtonClick.bind(this));
			this.#onlineModeLoginButton = null;
		}
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
