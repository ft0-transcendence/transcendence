import { authManager } from "@src/tools/AuthManager";
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
			</div>
		`;
	}

	async postRender() {
		this.#matchmakingSocket.emit('join-matchmaking');

		const matchFoundContainer = document.getElementById(`${this.id}-match-found-container`)!;
		const gameIdSpan = document.getElementById(`${this.id}-game-id`)!;

		this.#matchmakingSocket.on('match-found', (data) => {
			console.log('Match found', data);
			this.#matchmakingSocket?.close();
			matchFoundContainer.classList.remove('hidden');
			gameIdSpan.innerText = data.gameId;
		});
	}

	protected async destroy() {
		if (this.#matchmakingSocket.connected){
			this.#matchmakingSocket.close();
			console.debug('Cleaning up matchmaking socket');
		}
	}

}
