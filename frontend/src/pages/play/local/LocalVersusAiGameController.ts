import { RouteController } from '@tools/ViewController';
import { Game, GameClass } from '@shared';
import { GameComponent } from '@src/components/GameComponent';
import { authManager } from '@src/tools/AuthManager';
import { k } from '@src/tools/i18n';

export class LocalVersusAiGameController extends RouteController {
	#game: GameClass;
	#gameComponent: GameComponent;

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
		this.#game = new GameClass({
			gameStartCountdown: 3000,
			maxScore: 10,
			initialVelocity: 0.025,
			velocityIncrease: 0.000005,
			maxVelocity: 0.175,
			paddleSpeed: 0.69,
			movementSensitivity: 0.69,
			debug: false
		});


		// Initialize game component
		this.#gameComponent = new GameComponent({
			gameId: 'local-ai',
			gameType: 'AI',
			isLocalGame: true
		});
		this.#gameComponent.updateKeyBindings({})
		this.registerChildComponent(this.#gameComponent);
	}

	async render() {
		return /*html*/`
			<div class="flex flex-col grow">
				<!-- Username Prompt -->
				<div id="${this.id}-username-container" class="flex flex-col items-center justify-center grow">
					<div class="bg-zinc-800/50 p-8 rounded-lg max-w-md w-full shadow-md">
						<h2 class="text-2xl font-bold mb-6 text-center" data-i18n="${k('play.enter_your_username')}">Enter Your Username</h2>
						<form id="${this.id}-username-form" class="flex flex-col gap-4">
							<input
								type="text"
								id="${this.id}-username-input"
								class="px-4 py-2 bg-zinc-700 rounded border border-zinc-600 focus:border-amber-500 focus:outline-none"
								placeholder="Username"
								maxlength="24"
								required
							>
							<button
								type="submit"
								class="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded transition-colors"
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
						this.#game.movePlayerPaddle(this.#player!.id, direction);
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



				// Start the game
				this.#game.playerReady(this.#player);
				this.#game.playerReady(this.#ai);

				// Start game loop
				this.startGameLoop();
			}
		});
	}

	private startGameLoop() {
		const animate = (currentTime: number) => {
			if (this.#lastTime) {
				const delta = currentTime - this.#lastTime;

				this.#game.update(delta);

				const state = this.#game.getState();

				// AI movement logic
				// if (state.state === 'RUNNING') {
					const aiSide = this.#isPlayerLeft ? 'right' : 'left';
					const aiPaddlePos = aiSide === 'left' ? state.paddles.left : state.paddles.right;
					let target = 50;
					if (aiSide === 'right' && state.ball.dirX >= 0) {
						target = state.ball.y;
					}
					else if (aiSide === 'left' && state.ball.dirX <= 0) {
						target = state.ball.y;
					}
					const diff = target - aiPaddlePos;

					if (Math.abs(diff) > 1) {
						this.#game.movePlayerPaddle(this.#ai.id, diff > 0 ? "down" : "up");
					}
				// }

				this.#gameComponent?.updateGameState(this.#game.getState());
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
