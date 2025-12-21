import { authManager } from "@src/tools/AuthManager";
import { k } from "@src/tools/i18n";
import { AiAccuracy, AIBrain, Game, GameClass } from "@shared";
import { RouteController } from "@tools/ViewController";
import { GameComponent } from "@src/components/GameComponent";

export class LandingPageController extends RouteController {

	#game: GameClass = new GameClass({
		gameStartCountdown: 0,
		initialVelocity: 0.05,
		velocityIncrease: 0.000005,
		maxVelocity: 0.175,
		paddleSpeed: 0.90,
		movementSensitivity: 0.69,
		maxScore: null,
		paddleHeightPercentage: 20,
		debug: false,
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
					<div id="game-container" class="max-w-4xl w-full grow overflow-hidden">
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

		this.startAI();

		document.querySelector(`#${this.id}-login-btn`)?.addEventListener('click', () => {
			sessionStorage.removeItem('lastRoute')
			authManager.login();
		}, { once: true });

	}

	private startAI() {
		const leftAI = new AIBrain({ position: 'left', accuracy: AiAccuracy.PERFECT });
		const rightAI = new AIBrain({ position: 'right', accuracy: AiAccuracy.PERFECT });

		const animate = (currentTime: number) => {
			if (this.#lastTime) {
				leftAI.processCycle(this.#game.getState(), this.#game);
				rightAI.processCycle(this.#game.getState(), this.#game);
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
