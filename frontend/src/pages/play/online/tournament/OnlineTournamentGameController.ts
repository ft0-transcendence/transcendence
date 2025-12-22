
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

	#gameSocket?: Socket;

	#isGameValidated = false;

	#gameComponent: GameComponent;

	constructor(params: Record<string, string> | undefined = undefined) {
		super(params);

		this.#gameId = this.params.gameId;
		this.#tournamentId = this.params.tournamentId;

		this.#gameComponent = new GameComponent({
			gameId: this.#gameId,
			gameType: 'TOURNAMENT',
			isLocalGame: false,
			goBackPath: `/play/online/tournaments/${this.#tournamentId}`
		});

		this.#gameComponent.setMovementHandler((side, direction, type) => {
			// if (this.#gameState?.state !== 'RUNNING') return;
			const event = type === 'press' ? 'player-press' : 'player-release';
			this.#gameSocket?.emit(event, { direction, gameId: this.#gameId });
		});

		this.registerChildComponent(this.#gameComponent);

		this.updateTitleSuffix();
	}

	override updateTitleSuffix() {
		this.titleSuffix = t('page_titles.play.online.tournament_game') || '1 VS 1 - Tournament game';
	}

	protected async preRender(): Promise<void> {
		console.debug('OnlineTournamentGameController preRender. Params:', this.params);

		try {
			const game = await api.game.getTournamentGameDetails.query({ tournamentId: this.#tournamentId, gameId: this.#gameId });
			this.#game = game;
			console.debug('Tournament game loaded', this.#game);
		} catch (err) {
			if (err instanceof TRPCClientError) {
				console.error('Error loading tournament game:', err.message);
			}
			this.#game = null;
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
						${!this.#game
				? /*html*/`
								<div class="grow flex flex-col w-full items-center justify-center bg-black">
									<h3 data-i18n="${k('generic.game_not_found')}" class="text-2xl uppercase font-mono font-bold">Game not found</h3>
									<a data-route="/tournament" href="/play/online/tournaments"
										class="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-400 transition-colors">
										<i class="fa fa-arrow-left"></i>
										<span class="ml-1" data-i18n="${k('generic.go_back')}">Go back</span>
									</a>
								</div>
							`
				: ''
			}
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
		if (this.#game) {
			this.#setupSocketEvents();
		} else {
			this.unregisterChildComponent(this.#gameComponent);
		}
	}

	protected async destroy() {
		const eventsToRemove = [
			'tournament-game-joined',
			'error',
			'game-cancelled',
			'game-finished',
		]
		eventsToRemove.forEach(event => {
			this.#gameSocket?.off(event);
		});
		if (this.#gameSocket?.connected) {
			this.#gameSocket?.close();
		}
	}

	#setupSocketEvents() {
		this.#gameSocket = io("/tournament-game", {
			withCredentials: true,
		});

		// Setup socket connection in postRender to ensure proper timing
		this.#gameSocket.on('connect', () => {
			this.#gameSocket?.emit('join-tournament-game', this.#gameId);

			this.#gameSocket?.on('tournament-game-joined',
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
					console.debug('Tournament game joined!', data);
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

					const getPlayerName = (player: typeof otherPlayer) => player?.username || 'AI';

					if (data.ableToPlay) {
						this.titleSuffix = `VS ${getPlayerName(otherPlayer)}`;
					} else {
						this.titleSuffix = `${getPlayerName(data.game.leftPlayer)} vs ${getPlayerName(data.game.rightPlayer)}`;
					}

					// CRITICAL: Pass socket to GameComponent to enable game-state updates
					this.#gameComponent.updatePartialProps({
						socketConnection: this.#gameSocket
					});
				});

			this.#gameSocket?.on('error', (data) => {
				console.error('Tournament game socket error:', data);
				if (this.#isGameValidated) {
					toast.error('Error', data);
				} else {
					this.#gameComponent.showError(data);
				}
			});

			this.#gameSocket?.on('game-cancelled', (data) => {
				toast.error(t('game.aborted.generic'), data.message);
				this.#gameComponent.showError(
					/*html*/`
						<h3 data-i18n="${k('game.aborted.generic')}">Game aborted</h3>
					`
				);
			});

			this.#gameSocket?.on('game-finished', (data: { winnerId: string, winnerUsername: string }) => {
				console.debug('Tournament game finished', data);
				// TODO: Maybe add a winner banner
			});

			this.#gameSocket?.on('player-joined-tournament-game', (data: { userId: string, username: string }) => {
				console.debug('Player joined tournament game', data);
			});
		});

	}
}
