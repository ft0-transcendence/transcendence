import { Game, GameClass } from "@shared";
import { GameComponent } from "@src/components/GameComponent";
import { k } from "@src/tools/i18n";
import { RouteController } from "@src/tools/ViewController";

export class LocalVersusPlayerGameController extends RouteController {
	#game: GameClass;
	#gameComponent: GameComponent;

	#animationFrameId: number = 0;
	#lastTime: number = 0;

	#playerLeft: Game['GameUserInfo'] | null = null;
	#playerRight: Game['GameUserInfo'] | null = null;

	constructor(params: Record<string, string> | undefined = undefined) {
		super(params);
		this.#game = new GameClass({
			gameStartCountdown: 3000,
			debug: false
		});

		this.#gameComponent = new GameComponent({
			gameId: 'local-vs',
			gameType: 'VS',
			isLocalGame: true
		});
		this.#gameComponent.updateKeyBindings({}) // Initially disable controls
		this.registerChildComponent(this.#gameComponent);
	}

	async render() {
		return /*html*/`
			<div class="flex flex-col grow">
				<!-- Username Prompt -->
				<div id="${this.id}-username-container" class="flex flex-col items-center justify-center grow">
					<div class="bg-zinc-800/50 p-8 rounded-lg max-w-md w-full shadow-md">
						<h2 class="text-2xl font-bold mb-6 text-center" data-i18n="${k('play.enter_players_usernames')}">Enter Players Usernames</h2>
						<form id="${this.id}-username-form" class="flex flex-col gap-6">
							<!-- Left Player -->
							<div class="flex flex-col gap-2">
								<label class="text-sm text-gray-300" data-i18n="${k('play.left_player_input_label')}">Left Player (W, S keys)</label>
								<input
									type="text"
									id="${this.id}-left-username-input"
									class="px-4 py-2 bg-zinc-700 rounded border border-zinc-600 focus:border-amber-500 focus:outline-none"
									placeholder="Left player username"
									maxlength="24"
									required
								>
							</div>

							<!-- Right Player -->
							<div class="flex flex-col gap-2">
								<label class="text-sm text-gray-300" data-i18n="${k('play.right_player_input_label')}">Right Player (↑, ↓ keys)</label>
								<input
									type="text"
									id="${this.id}-right-username-input"
									class="px-4 py-2 bg-zinc-700 rounded border border-zinc-600 focus:border-amber-500 focus:outline-none"
									placeholder="Right player username"
									maxlength="24"
									required
								>
							</div>

							<button
								type="submit"
								class="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded transition-colors mt-4"
								data-i18n="${k('play.start_game')}"
							>
								Start Game
							</button>
						</form>
					</div>
				</div>

				<!-- Game Container -->
				<div id="${this.id}-game-container" class="hidden flex-col grow sm:flex-row sm:justify-center w-full">
					<section class="flex flex-col sm:min-w-32 sm:grow">
					</section>

					<section class="flex flex-col grow sm:items-center sm:w-full max-w-2xl">
						<div class="grow flex flex-col w-full">
							${await this.#gameComponent?.render() ?? ''}
						</div>
					</section>

					<section class="hidden sm:flex sm:min-w-32 sm:grow">
					</section>
				</div>
			</div>
		`;
	}

	protected async postRender() {
		const usernameContainer = document.getElementById(`${this.id}-username-container`);
		const gameContainer = document.getElementById(`${this.id}-game-container`);
		const form = document.getElementById(`${this.id}-username-form`);
		const leftInput = document.getElementById(`${this.id}-left-username-input`) as HTMLInputElement;
		const rightInput = document.getElementById(`${this.id}-right-username-input`) as HTMLInputElement;

		leftInput?.focus();

		form?.addEventListener('submit', (e) => {
			e.preventDefault();
			const leftUsername = leftInput.value.trim();
			const rightUsername = rightInput.value.trim();

			if (leftUsername && rightUsername) {
				this.#playerLeft = {
					id: 'player-left',
					username: leftUsername,
					isPlayer: true
				};
				this.#playerRight = {
					id: 'player-right',
					username: rightUsername,
					isPlayer: true
				};

				this.#game.setPlayers(this.#playerLeft, this.#playerRight);

				usernameContainer?.classList.add('hidden');
				gameContainer?.classList.remove('hidden');
				gameContainer?.classList.add('flex');

				this.#gameComponent.setActivePlayers(true, true);

				this.#gameComponent.updateCanvasSize();

				this.#gameComponent.setMovementHandler((side, direction, type) => {
					if (this.#game.getState().state !== 'RUNNING') return;
					if (type === 'press') {
						this.#game.press(side, direction);
					} else if (type === 'release') {
						this.#game.release(side, direction);
					}
				});

				const keyBindings: GameComponent['defaultKeyBindings'] = {
					'w': { side: 'left', direction: 'up' },
					's': { side: 'left', direction: 'down' },
					'arrowup': { side: 'right', direction: 'up' },
					'arrowdown': { side: 'right', direction: 'down' },
				};

				this.#gameComponent.updateKeyBindings(keyBindings);

				this.#game.playerReady(this.#playerLeft);
				this.#game.playerReady(this.#playerRight);

				(this.#game as any).updatePartialConfig?.({ enableInternalLoop: true });
				this.#game.start();
				this.startGameLoop();
			}
		});
	}

	private startGameLoop() {
		const animate = (_currentTime: number) => {
			this.#gameComponent?.updateGameState(this.#game.getState());
			this.#animationFrameId = requestAnimationFrame(animate);
		};
		this.#animationFrameId = requestAnimationFrame(animate);
	}

	protected async destroy() {
		console.debug('Cleaning up local VS game');
		cancelAnimationFrame(this.#animationFrameId);
		this.#lastTime = 0;
		this.#animationFrameId = 0;
	}
}
