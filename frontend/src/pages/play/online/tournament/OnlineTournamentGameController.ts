
import { api } from "@main";
import { Game, RouterOutputs, STANDARD_GAME_CONFIG } from "@shared";
import { GameComponent } from "@src/components/GameComponent";
import { authManager } from "@src/tools/AuthManager";
import { k, t } from "@src/tools/i18n";
import toast from "@src/tools/Toast";
import { RouteController } from "@src/tools/ViewController";
import { TRPCClientError } from "@trpc/client";
import { io, Socket } from "socket.io-client";

export class OnlineTournamentGameController extends RouteController {

	#gameId: string = "";
	#game: RouterOutputs['game']['getTournamentGameDetails'] | null = null;
	#tournamentId: string = "";

	#gameSocket: Socket;

	#isGameValidated = false;

	#gameComponent: GameComponent;

	constructor(params: Record<string, string> | undefined = undefined) {
		super(params);

		this.#gameId = this.params.gameId;
		this.#tournamentId = this.params.tournamentId;

		this.#gameSocket = io("/tournament", {
			withCredentials: true,
		});

		this.#gameSocket.on('connect', () => {
			console.debug('Game Socket connected to server');
			this.#gameSocket.emit('join-tournament-game', this.#gameId);
		});
		this.#setupSocketEvents();

		this.#gameComponent = new GameComponent({
			gameId: this.#gameId,
			gameType: 'TOURNAMENT',
			isLocalGame: false,
		});
		this.registerChildComponent(this.#gameComponent);

		this.updateTitleSuffix();
	}

	override updateTitleSuffix() {
		this.titleSuffix = t('page_titles.play.online.tournament_game') || '1 VS 1 - Tournament game';
	}

	protected async preRender(): Promise<void> {
		console.debug('OnlineVersusGameController preRender. Params:', this.params);

		let gameFound = false;
		try {
			const game = await api.game.getTournamentGameDetails.query({tournamentId: this.#tournamentId, gameId: this.#gameId});
			this.#game = game;
			gameFound = game != null;
		} catch (err) {
			gameFound = false;
		}
		if (!gameFound) {
			console.debug('Game not found');
			this.#gameComponent.showError(
				/*html*/`
					<h3 data-i18n="${k('generic.game_not_found')}">Game not found</h3>
				`
			);
			this.#isGameValidated = true;
		}

	}



	async render() {
		return /*html*/`<div class="flex flex-col grow">
			<div id="${this.id}-game-container" class="flex flex-col grow sm:flex-row sm:justify-center w-full">
				<section class="flex flex-col sm:min-w-32 sm:grow">
				</section>

				<section class="flex flex-col grow sm:items-center sm:w-full max-w-2xl">
					<div class="grow flex flex-col w-full">
						<!-- GAME COMPONENT -->
						${this.#game != null ? await this.#gameComponent!.render() : ''}
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
			// if (this.#gameState?.state !== 'RUNNING') return;
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

	#setupSocketEvents() {
		this.#gameSocket.on('tournament-game-joined',
			(data: {
				gameId: string,
				game: {
					leftPlayer: Game['GameUserInfo'],
					rightPlayer: Game['GameUserInfo'],
					state: Game['GameStatus']
				},
				playerSide: 'left' | 'right',
				isPlayer: boolean,
				ableToPlay: boolean,
			}) => {
				console.debug('Game found', data);
				this.#isGameValidated = true;

				const myId = authManager.user?.id;
				const amILeftPlayer = data.playerSide === 'left';

				this.#gameComponent.updateGameState(data.game.state);
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

				const otherPlayer = amILeftPlayer ? data.game.rightPlayer : data.game.leftPlayer;

				if (data.ableToPlay) {
					this.titleSuffix = `VS ${otherPlayer.username}`;
				} else {
					this.titleSuffix = `${data.game.leftPlayer.username} vs ${data.game.rightPlayer.username}`;
				}
				this.#gameComponent.updatePartialProps({
					socketConnection: this.#gameSocket
				});
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

		this.#gameSocket.on('game-cancelled', (data) => {
			toast.error('Partita cancellata', data.message);
		});
	}
}
