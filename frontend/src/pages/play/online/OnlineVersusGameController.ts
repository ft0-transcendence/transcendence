import { Game } from "@shared";
import { GameComponent } from "@src/components/GameComponent";
import { authManager } from "@src/tools/AuthManager";
import { t } from "@src/tools/i18n";
import toast from "@src/tools/Toast";
import { RouteController } from "@src/tools/ViewController";
import { io, Socket } from "socket.io-client";

export class OnlineVersusGameController extends RouteController {
	#gameId: string = "";
	#gameSocket: Socket;

	#connectedUsers: Game['GameUserInfo'][] = [];

	#isGameValidated = false;

	#isPlayer = false;
	#isGameStarted = false;
	#gameState: Game['GameStatus'] | null = null;

	#errors: string[] = [];

	#gameComponent: GameComponent;


	constructor(params: Record<string, string> | undefined = undefined) {
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

		this.#gameComponent = new GameComponent({
			gameId: this.#gameId,
			gameType: 'VS',
			isLocalGame: false,
		});
		this.registerChildComponent(this.#gameComponent);

		this.updateTitleSuffix();
	}

	override updateTitleSuffix() {
		this.titleSuffix = t('page_titles.play.online.1v1_game') || '1 VS 1 - game';
	}

	#setupSocketEvents() {
		this.#gameSocket.on('game-found',
			(data: {
				connectedUsers: Game['GameUserInfo'][],
				leftPlayer: Game['GameUserInfo'],
				rightPlayer: Game['GameUserInfo'],
				ableToPlay: boolean,
				state: Game['GameStatus']
			}) => {
				console.debug('Game found', data);
				this.#isGameValidated = true;
				this.#connectedUsers = data.connectedUsers;
				this.#isPlayer = data.ableToPlay;
				this.#gameState = data.state;

				const myId = authManager.user?.id;
				const amILeftPlayer = data.leftPlayer.id === myId;

				this.#gameComponent.updateGameState(data.state);
				this.#gameComponent.setActivePlayers(amILeftPlayer, !amILeftPlayer);

				let newKeyBindings: GameComponent['defaultKeyBindings'] = {};

				if (amILeftPlayer) {
					newKeyBindings = {
						'w': { side: 'left', direction: 'up' },
						's': { side: 'left', direction: 'down' },
						'arrowup': { side: 'left', direction: 'up' },
						'arrowdown': { side: 'left', direction: 'down' },
					}
				} else {
					newKeyBindings = {
						'w': { side: 'right', direction: 'up' },
						's': { side: 'right', direction: 'down' },
						'arrowup': { side: 'right', direction: 'up' },
						'arrowdown': { side: 'right', direction: 'down' },
					}
				}

				this.#gameComponent.updateKeyBindings(newKeyBindings);

				const otherPlayer = amILeftPlayer ? data.rightPlayer : data.leftPlayer;

				if (data.ableToPlay) {
					this.titleSuffix = `VS ${otherPlayer.username}`;
				} else {
					this.titleSuffix = `${data.leftPlayer.username} vs ${data.rightPlayer.username}`;
				}
			});

		this.#gameSocket.on('player-joined', (user: Game['GameUserInfo']) => {
			console.debug('Player joined', user);
			this.#connectedUsers.push(user);
		});

		this.#gameSocket.on('player-left', (user: Game['GameUserInfo']) => {
			console.debug('Player left', user);
			document.querySelector(`#game-connected-user-${user.id}`)?.remove();
			this.#connectedUsers = this.#connectedUsers.filter(p => p.id !== user.id);
		});

		this.#gameSocket.on('game-state', (data: Game['GameStatus']) => {
			this.#gameState = data;
			this.#gameComponent.updateGameState(data);
		});

		this.#gameSocket.on('error', (data) => {
			console.debug('Error', data);
			if (this.#isGameValidated) {
				// GAME IS FOUND BUT THERE IS AN ERROR
				console.error('Game error', data);
				toast.error('Error', data);
			} else {
				console.debug('Game not found');
				this.#gameComponent.showError(data);
			}
		});
	}

	protected async preRender(): Promise<void> {
		console.debug('OnlineVersusGameController preRender. Params:', this.params);
	}

	async render() {
		return /*html*/`<div class="flex flex-col grow">
			<div id="${this.id}-game-container" class="flex flex-col grow sm:flex-row sm:justify-center w-full">
				<section class="flex flex-col sm:min-w-32 sm:grow">
				</section>

				<section class="flex flex-col grow sm:items-center sm:w-full max-w-2xl">
					<div class="grow flex flex-col w-full">
						<!-- GAME COMPONENT -->
						${await this.#gameComponent!.render()}
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

	protected async postRender() {
		console.debug('Listening for errors');

		this.#gameComponent.setMovementHandler((side, direction, type) => {
			if (this.#gameState?.state !== 'RUNNING') return;
			const event = type === 'press' ? 'player-press' : 'player-release';
			this.#gameSocket.emit(event, direction);
		});

	}
	protected async destroy() {
		if (this.#gameSocket.connected) {
			this.#gameSocket.close();
			console.debug('Cleaning up game socket');
		}
	}
}
