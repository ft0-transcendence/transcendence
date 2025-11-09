import { Game, GameClass, STANDARD_GAME_CONFIG } from "@shared";
import { GameComponent } from "@src/components/GameComponent";
import { k, t } from "@src/tools/i18n";
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
		this.#game = new GameClass(STANDARD_GAME_CONFIG);

		this.#gameComponent = new GameComponent({
			gameId: 'local-vs',
			gameType: 'VS',
			isLocalGame: true
		});
		this.#gameComponent.updateKeyBindings({}) // Initially disable controls
		this.registerChildComponent(this.#gameComponent);

		this.updateTitleSuffix();
	}


	override updateTitleSuffix() {
		this.titleSuffix = t('page_titles.play.offline.1v1') || '1 VS 1 - offline';
	}

	async render() {
		return /*html*/`
			<div class="flex flex-col grow">
				<!-- Username Prompt -->
				<div id="${this.id}-username-container" class="relative z-50 w-full max-w-md mx-4 bg-neutral-950 rounded-lg p-5 shadow-xl my-auto self-center align-middle">
					<h3 class="text-lg font-semibold mb-3" data-i18n="${k('play.enter_players_usernames')}">Enter Players Usernames</h3>

					<form id="${this.id}-username-form" class="flex flex-col gap-3 text-white">
						<!-- Left Player -->
						<label for="${this.id}-left-username-input" class="text-sm text-gray-300" data-i18n="${k('play.left_player_input_label')}">Left Player (w, s keys)</label>
						<input type="text" id="${this.id}-left-username-input"
								class="w-full bg-neutral-600/20 text-white p-2 rounded-md border border-white/5 focus-within:ring-1 focus-within:ring-amber-400"
								placeholder="Left player username"
								maxlength="24"
								required
								data-placeholder-i18n="${k('play.left_player_input_placeholder')}"
							>

						<!-- Right Player -->
						<label for="${this.id}-right-username-input" class="text-sm text-gray-300" data-i18n="${k('play.right_player_input_label')}">Right Player (↑, ↓ keys)</label>
						<input type="text"
								id="${this.id}-right-username-input"
								class="w-full bg-neutral-600/20 text-white p-2 rounded-md border border-white/5 focus-within:ring-1 focus-within:ring-amber-400"
								placeholder="Right player username"
								maxlength="24"
								required
								data-placeholder-i18n="${k('play.right_player_input_placeholder')}"
							>

						<div class="flex gap-2 justify-end mt-2">
							<button type="submit" class="px-3 py-1 rounded-md bg-amber-500 hover:bg-amber-400 transition-colors text-black font-semibold cursor-pointer" data-i18n="${k('play.start_game')}">
								Start Game
							</button>
						</div>
					</form>
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

				this.#game.start();
				this.startGameLoop();
			}
		});
	}

	private startGameLoop() {
		// The game handles its own internal loop, we just need to render the state
		const animate = (currentTime: number) => {
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
