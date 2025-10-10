import { authManager } from "@src/tools/AuthManager";
import { k } from "@src/tools/i18n";
import { Game, GameClass } from "@shared";
import { RouteController } from "@tools/ViewController";
import { GameComponent } from "@src/components/GameComponent";

export class LandingPageController extends RouteController {

	#game: GameClass = new GameClass({
		gameStartCountdown: 0,
		initialVelocity: 0.025,
		velocityIncrease: 0.000005,
		maxVelocity: 0.175,
		paddleSpeed: 0.69,
		movementSensitivity: 0.69,
		maxScore: undefined,
		paddleHeightPercentage: 20,
		debug: false,
		enableInternalLoop: true,
		shouldUseRequestAnimationFrame: true,
	});;
	#gameComponent: GameComponent = new GameComponent({
		gameId: "demo",
		gameType: 'VS',
		isLocalGame: true,
	});

	#animationFrameId: number = 0;
	#lastTime: number = 0;

	#user1: Game['GameUserInfo'];
	#user2: Game['GameUserInfo'];

	constructor() {
		super();

		this.registerChildComponent(this.#gameComponent);

		this.#user1 = { id: '1', username: 'Leo' };
		this.#user2 = { id: '2', username: 'Pasquale' };

		this.#game.setPlayers(this.#user1, this.#user2);
	}

	protected async preRender(): Promise<void> {


		this.#gameComponent.setMovementHandler(() => { });
		this.#gameComponent.updateKeyBindings({});
	}

	async render() {
		const isLoggedIn = await authManager.isUserLoggedIn();


		return /*html*/`
			<div class="relative flex flex-col grow w-full items-center justify-center">
				<div class="absolute top-0 left-0 w-full h-full opacity-25 flex flex-col justify-center items-center">
                    <div id="game-container" class="max-w-5xl w-full grow overflow-hidden">
						${await this.#gameComponent!.silentRender()}
					</div>
                </div>
				<div class="flex flex-col grow items-center gap-8 justify-center text-center z-20 bg-black/25 p-2 md:p-8">
					<h1 class="text-6xl font-bold mb-4">Pong Game</h1>
					<p class="text-xl text-center max-w-2xl mb-8" data-i18n="${k('landing_page.description')}">
						Welcome to the classic Pong experience! Challenge your friends or improve your skills
						in this timeless game of digital table tennis. Simple to learn, hard to master.
					</p>
					<div class="flex flex-col sm:flex-row gap-4">
						<button data-route="/play" data-i18n="${k('navbar.start_playing')}" class="bg-teal-700 cursor-pointer uppercase px-6 py-2 rounded-md drop-shadow-md drop-shadow-black hover:drop-shadow-teal-950 active:drop-shadow-teal-950 font-mono text-xl font-bold">
							Start Playing
						</button>
						<button id="${this.id}-login-btn" data-i18n="${k('navbar.login')}" class="${isLoggedIn ? '!hidden' : ''} bg-rose-800 cursor-pointer uppercase px-6 py-2 rounded-md drop-shadow-md drop-shadow-black hover:drop-shadow-rose-950 active:drop-shadow-rose-950 font-mono text-xl font-bold">
							Sign In
						</button>
					</div>
				</div>
			</div>
        `;
	}

	async postRender() {
		this.#game.playerReady(this.#user1);
		this.#game.playerReady(this.#user2);
		this.#game.start();

		this.#gameComponent!.setActivePlayers(false, false);

		this.startAnimation();

		document.querySelector(`#${this.id}-login-btn`)?.addEventListener('click', () => {
			sessionStorage.removeItem('lastRoute')
			authManager.login();
		}, { once: true });

	}

	// TODO: improve it :)
	// CHATGPT START=================================================================================
	private startAnimation() {
		// TODO: use the Game's loop instead of this
		const animate = (currentTime: number) => {
			if (this.#lastTime) {
				const delta = currentTime - this.#lastTime;

				// AI movement logic
				const state = this.#game.getState();

				const leftTarget = state.ball.dirX < 0 ? state.ball.y : 50;
				const leftDiff = leftTarget - state.paddles.left;
				if (Math.abs(leftDiff) > 1) {
					if (leftDiff > 0) { this.#game.release('left', 'up'); this.#game.press('left', 'down'); }
					else { this.#game.release('left', 'down'); this.#game.press('left', 'up'); }
				} else {
					this.#game.release('left', 'up'); this.#game.release('left', 'down');
				}

				const rightTarget = state.ball.dirX > 0 ? state.ball.y : 50;
				const rightDiff = rightTarget - state.paddles.right;
				if (Math.abs(rightDiff) > 1) {
					if (rightDiff > 0) { this.#game.release('right', 'up'); this.#game.press('right', 'down'); }
					else { this.#game.release('right', 'down'); this.#game.press('right', 'up'); }
				} else {
					this.#game.release('right', 'up'); this.#game.release('right', 'down');
				}

				// Game updates internally now; only render
				this.#gameComponent?.updateGameState(this.#game.getState());
			}

			this.#lastTime = currentTime;
			this.#animationFrameId = requestAnimationFrame(animate);
		}

		requestAnimationFrame(animate);
	}

	protected async destroy() {
		console.debug(`Cleaning up LandingPageController resources`);

		cancelAnimationFrame(this.#animationFrameId);
		this.#lastTime = 0;
		this.#animationFrameId = 0;
	}
}
