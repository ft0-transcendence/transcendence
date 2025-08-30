import { Game, GameUserInfo } from "@shared";
import { authManager } from "@src/tools/AuthManager";
import toast from "@src/tools/Toast";
import { RouteController } from "@src/tools/ViewController";
import { io, Socket } from "socket.io-client";
import { unknown } from "zod";

export class OnlineVersusGameController extends RouteController {
	#gameId: string = "";
	#gameSocket: Socket;

	#connectedUsers: GameUserInfo[] = [];

	#isGameValidated = false;

	#isPlayer = false;
	#isGameStarted = false;
	#gameState: unknown;

	#errors: string[] = [];

	constructor(params: Record<string, string>) {
		super(params);

		this.#gameId = this.params.gameId;
		this.#gameSocket = io("/vs-game", {
			withCredentials: true,
		});

		this.#gameSocket.on('connect', () => {
			console.debug('Game Socket connected to server');
			this.#gameSocket.emit('join-game', this.#gameId);
		});
		this.#setupSocketEvents();
	}

	#setupSocketEvents() {
		this.#gameSocket.on('game-found', (data: { connectedUsers: GameUserInfo[], leftPlayer: GameUserInfo, rightPlayer: GameUserInfo, ableToPlay: boolean }) => {
			console.debug('Game found', data);
			this.#isGameValidated = true;
			this.#connectedUsers = data.connectedUsers;
			this.#isPlayer = data.ableToPlay;

			if (data.ableToPlay) {
				const myId = authManager.user?.id;
				const otherPlayer = data.leftPlayer.id === myId ? data.rightPlayer : data.leftPlayer;
				this.titleSuffix = `VS ${otherPlayer.username}`;
			} else {
				this.titleSuffix = `${data.leftPlayer.username} vs ${data.rightPlayer.username}`;
			}
		});

		this.#gameSocket.on('player-joined', (user: GameUserInfo) => {
			console.debug('Player joined', user);
			this.#connectedUsers.push(user);
		});

		this.#gameSocket.on('player-left', (user: GameUserInfo) => {
			console.debug('Player left', user);
			document.querySelector(`#game-connected-user-${user.id}`)?.remove();
			this.#connectedUsers = this.#connectedUsers.filter(p => p.id !== user.id);
		});

		this.#gameSocket.on('game-state', (data: Game['state']) => {
			console.debug('Game state', data);
			this.#gameState = data;
		});

		this.#gameSocket.on('error', (data) => {
			console.debug('Error', data);
			if (this.#isGameValidated) {
				// GAME IS FOUND BUT THERE IS AN ERROR
				console.error('Game error', data);
				toast.error('Error', data);
			} else {
				console.debug('Game not found');
				this.#errors.push(data);
			}
		});
	}

	protected async preRender(): Promise<void> {
		console.debug('OnlineVersusGameController preRender. Params:', this.params);
	}

	async render() {
		return /*html*/`<div class="flex flex-col grow skeletonize">

			<div id="${this.id}-game-container" class="flex flex-col grow sm:flex-row sm:justify-center w-full">

				<section class="flex flex-col sm:min-w-32 sm:grow">
				</section>

				<section class="flex flex-col grow sm:items-center sm:w-full max-w-2xl">
					<div class="grow flex flex-col w-full">
						<!-- GAME COMPONENT -->
						<p>
						GAME COMPONENT
						</p>
					</div>

					<!-- CONTROLS CONTAINER (for mobile) -->
					<div class="flex flex-col h-60 sm:hidden">
						TODO: GAME CONTROLS
					</div>
				</section>
				<section class="hidden sm:flex sm:min-w-32 sm:grow">

				</section>
			</div>

			<div id="${this.id}-error-container" class="hidden">
				<h3>Error</h3>
				<p id="${this.id}-error-message" class="text-red-500"></p>
			</div>
		</div>`;
	}

	#errorsTimeout: NodeJS.Timeout | null = null;
	protected async postRender() {
		console.debug('Listening for errors');
		this.#listenForErrors();
	}

	#listenForErrors() {
		if (this.#errorsTimeout) {
			clearTimeout(this.#errorsTimeout);
		}
		this.#errorsTimeout = setTimeout(() => {
			this.#errorsTimeout = null;
			const errorContainer = document.getElementById(`${this.id}-error-container`)!;
			const errorMessage = document.getElementById(`${this.id}-error-message`)!;
			if (this.#errors.length === 0) {
				errorContainer.classList.add('hidden');
				return;
			}
			errorContainer.classList.remove('hidden');
			errorMessage.innerHTML = this.#errors.join('<br>');
		}, 5000);
	}

	protected async destroy() {
		if (this.#gameSocket.connected) {
			this.#gameSocket.close();
			console.debug('Cleaning up game socket');
		}
		if (this.#errorsTimeout) {
			clearTimeout(this.#errorsTimeout);
		}
	}
}
