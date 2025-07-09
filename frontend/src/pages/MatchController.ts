import { RouteController } from "../types/pages";
import { io, Socket } from 'socket.io-client';

export class MatchController extends RouteController {
	#socket: Socket | null = null;

	constructor() {
		super();
		this.titleSuffix = 'Play';
	}

	protected async preRender() {
		this.#socket = io({
			withCredentials: true,
		});

		this.#socket.on('connect', () => {
			console.debug('Socket connected to server');

		});

		this.#socket!.emit('join-matchmaking');
	}

	async render() {
		return /*html*/`
			<div class="flex flex-col grow w-full items-center justify-center">
				<h1>match page works!</h1>
			</div>
		`;
	}

	async postRender() {
	}


	protected async destroy() {
		if (this.#socket) {
			console.debug('Cleaning up socket.io connection');
			// If already connected or connecting, try to disconnect safely
			console.debug('Socket connecting=', this.#socket.connected);

			if (this.#socket.connected) {
				this.#socket.removeAllListeners();
				this.#socket.disconnect();
			} else {
				console.debug('Socket was not connected (yet), forcing close');
				this.#socket.close(); // Force close (does not emit disconnect events)
			}
			this.#socket = null;
		}
	}

}
