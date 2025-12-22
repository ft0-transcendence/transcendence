import { api } from "@main";
import { Game, RouterOutputs, STANDARD_GAME_CONFIG } from "@shared";
import { GameComponent } from "@src/components/GameComponent";
import { authManager } from "@src/tools/AuthManager";
import { k, t } from "@src/tools/i18n";
import toast from "@src/tools/Toast";
import { RouteController } from "@src/tools/ViewController";
import { showAndLogTrpcError } from "@src/utils/trpcResponseUtils";
import { TRPCClientError } from "@trpc/client";
import { io, Socket } from "socket.io-client";

export class OnlineVersusGameController extends RouteController {
	#gameId: string = "";
	#gameSocket: Socket;
	#gameDto: RouterOutputs['game']['getVersusGameDetails'] | null = null;

	#isGameValidated = false;

	#gameComponent: GameComponent;


	constructor(params: Record<string, string> | undefined = undefined) {
		super(params);

		this.#gameId = this.params.gameId;
		this.#gameSocket = io("/vs-game", {
			withCredentials: true,
		});

		this.#gameComponent = new GameComponent({
			gameId: this.#gameId,
			gameType: 'VS',
			isLocalGame: false,
		});

		this.registerChildComponent(this.#gameComponent);

		this.#gameSocket.on('connect', () => {
			console.debug('Game Socket connected to server');
			this.#gameSocket.emit('join-game', this.#gameId);

			this.#gameComponent.updatePartialProps({
				socketConnection: this.#gameSocket
			})

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
				this.#gameComponent.showError(data.message);
			});
		});

		this.updateTitleSuffix();
	}

	override updateTitleSuffix() {
		if (this.#gameDto) {
			this.titleSuffix = `${this.#gameDto.leftPlayerUsername} ${t('generic.vs')} ${this.#gameDto.rightPlayerUsername} - ${t('page_titles.play.online.1v1_game')}`;
		} else {
			this.titleSuffix = t('page_titles.play.online.1v1_game') || '1 VS 1 - game';
		}
	}

	protected async preRender(): Promise<void> {
		console.debug('OnlineVersusGameController preRender. Params:', this.params);
		try {
			this.#gameDto = await api.game.getVersusGameDetails.query({
				gameId: this.#gameId,
			});
			console.debug('Game', this.#gameDto);
		} catch (err) {
			if (err instanceof TRPCClientError) {
				console.error('Error', err.message);
				showAndLogTrpcError(err, 'generic.game');
				this.#gameDto = null;
			}
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

						${await this.#gameComponent.silentRender()}
						${!this.#gameDto
				? /*html*/`
								<div class="grow flex flex-col w-full items-center justify-center bg-black">
									<h3 data-i18n="${k('generic.game_not_found')}" class="text-2xl uppercase font-mono font-bold">Game not found</h3>
									<a data-route="/play" href="/play/online/games"
										class="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-400 transition-colors">
										<i class="fa fa-arrow-left"></i>
										<span class="ml-1" data-i18n="${k('generic.go_back')}">Go back</span>
									</a>
								</div>
							`
				: ``}
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
		if (this.#gameDto) {
			this.#gameComponent.setMovementHandler((side, direction, type) => {
				// if (this.#gameState?.state !== 'RUNNING') return;
				const event = type === 'press' ? 'player-press' : 'player-release';
				this.#gameSocket.emit(event, { direction, gameId: this.#gameId });
			});

		} else {
			this.unregisterChildComponent(this.#gameComponent);
		}
	}
	protected async destroy() {
		if (this.#gameSocket.connected) {
			this.#gameSocket.close();
			console.debug('Cleaning up game socket');
		}
	}

}
