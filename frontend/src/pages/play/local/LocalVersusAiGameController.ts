import { RouteController } from '@tools/ViewController';
import { AIBrain, Game, GameClass, STANDARD_GAME_CONFIG } from '@shared';
import { GameComponent } from '@src/components/GameComponent';
import { authManager } from '@src/tools/AuthManager';
import { k, t } from '@src/tools/i18n';

export class LocalVersusAiGameController extends RouteController {
	#game: GameClass;
	#gameComponent: GameComponent;

	#aiEnemyBrain: AIBrain;

	#animationFrameId: number = 0;
	#lastTime: number = 0;

	#player: Game['GameUserInfo'] | null = null;

	#ai: Game['GameUserInfo'] = {
		id: 'ai',
		username: 'AI'
	};

	#isPlayerLeft: boolean = Math.random() > 0.5;

	constructor(params: Record<string, string> | undefined = undefined) {
		super(params);
		this.#game = new GameClass(STANDARD_GAME_CONFIG);


		// Initialize game component
		this.#gameComponent = new GameComponent({
			gameId: 'local-ai',
			isLocalGame: true,
		});
		this.#gameComponent.updateKeyBindings({})
		this.registerChildComponent(this.#gameComponent);

		this.#aiEnemyBrain = new AIBrain();


		this.updateTitleSuffix();
	}

	override updateTitleSuffix() {
		this.titleSuffix = t('page_titles.play.offline.1vAI') || '1 VS AI - offline';
	}

	async render() {
		return /*html*/`
			<div class="flex flex-col grow">
				<!-- Username Prompt -->
				<div id="${this.id}-username-container" class="relative z-50 w-full max-w-md mx-4 bg-neutral-950 rounded-lg p-5 shadow-xl my-auto self-center align-middle">
					<h3 class="text-lg font-semibold mb-3" data-i18n="${k('play.enter_your_username')}">Enter Your Username</h3>


					<form id="${this.id}-username-form" class="flex flex-col gap-3 text-white">
						<label for="${this.id}-username-input" class="text-sm text-gray-300" data-i18n="${k('generic.username')}">Username</label>
						<input type="text"
								id="${this.id}-username-input"
								class="w-full bg-neutral-600/20 text-white p-2 rounded-md border border-white/5 focus-within:ring-1 focus-within:ring-amber-400"
								placeholder="Username"
								maxlength="24"
								required
								data-placeholder-i18n="${k('generic.username')}"
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
		const input = document.getElementById(`${this.id}-username-input`) as HTMLInputElement;

		let usableUsername = null;

		try {
			const loggedIn = await authManager.isUserLoggedIn();
			if (loggedIn) {
				usableUsername = authManager.user?.username;
			}
		} catch (error) {
		}

		if (usableUsername) {
			input.value = usableUsername;
		}

		input?.focus();

		form?.addEventListener('submit', (e) => {
			e.preventDefault();
			const username = input.value.trim();
			if (username) {
				// Set player info
				this.#player = {
					id: 'player',
					username,
					isPlayer: true
				};

				// Initialize game
				const leftPlayer = this.#isPlayerLeft ? this.#player : this.#ai;
				const rightPlayer = this.#isPlayerLeft ? this.#ai : this.#player;
				this.#game.setPlayers(leftPlayer!, rightPlayer!);

				// Hide username prompt, show game
				usernameContainer?.classList.add('hidden');
				gameContainer?.classList.remove('hidden');
				gameContainer?.classList.add('flex');

				this.#gameComponent.updateCanvasSize();

				// Initialize game
				this.#gameComponent!.setActivePlayers(this.#isPlayerLeft, !this.#isPlayerLeft);
				this.#gameComponent!.setMovementHandler((side, direction, type) => {
					if (this.#game.getState().state !== 'RUNNING') return;
					if (type === 'press') {
						this.#game.press(side, direction);
					} else if (type === 'release') {
						this.#game.release(side, direction);
					}
				});

				let keyBindings: GameComponent['defaultKeyBindings'];
				if (this.#isPlayerLeft) {
					keyBindings = {
						'w': { side: 'left', direction: 'up' },
						's': { side: 'left', direction: 'down' },
						'arrowup': { side: 'left', direction: 'up' },
						'arrowdown': { side: 'left', direction: 'down' },
					};
				} else {
					keyBindings = {
						'w': { side: 'right', direction: 'up' },
						's': { side: 'right', direction: 'down' },
						'arrowup': { side: 'right', direction: 'up' },
						'arrowdown': { side: 'right', direction: 'down' },
					}
				}

				this.#gameComponent.updateKeyBindings(keyBindings);


				if (this.#isPlayerLeft) {
					this.#aiEnemyBrain.setPosition('right');
				}

				// Start the game (internal loop)
				this.#game.playerReady(this.#player);
				this.#game.playerReady(this.#ai);
				this.#game.start();
				this.startGameLoop();
			}
		});
	}

	private startGameLoop() {
		// The game handles its own internal loop, we handle AI logic and render the state
		const animate = (currentTime: number) => {
			if (this.#lastTime) {
				const state = this.#game.getState();
				this.#aiEnemyBrain.processCycle(state, this.#game);
				this.#gameComponent?.updateGameState(state);
			}
			this.#lastTime = currentTime;
			this.#animationFrameId = requestAnimationFrame(animate);
		};
		this.#animationFrameId = requestAnimationFrame(animate);
	}

	protected async destroy() {
		console.debug('Cleaning up local AI game');
		cancelAnimationFrame(this.#animationFrameId);
		this.#lastTime = 0;
		this.#animationFrameId = 0;
	}
}
