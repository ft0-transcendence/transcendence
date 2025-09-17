import { Game } from "@shared";
import { k } from "@src/tools/i18n";
import toast from "@src/tools/Toast";
import { ComponentController } from "@src/tools/ViewController";

export type GameComponentProps = {

	gameId: string;
	gameType: Game['GameType'];

	isLocalGame: boolean;
}

export type GameComponentMovementHandler = (
	side: GameKeyBindings[string]['side'],
	direction: GameKeyBindings[string]['direction'],
	type: 'press' | 'release'
) => void;

/**
 * Key bindings configuration
 * key: the key pressed
 * side: which paddle to move ('left' or 'right')
 * action: the action to perform ('up' or 'down')
 */
type GameKeyBindings = {
	[key: string]: {
		side: 'left' | 'right';
		direction: Game['MovePaddleAction']
	}
}


// TODO: move to backend and retrieve it from socket?
const PADDLE_WIDTH = 20;
const BALL_SIZE = 6.9;


export class GameComponent extends ComponentController {
	readonly defaultKeyBindings: GameKeyBindings = {
		'w': { side: 'left', direction: 'up' },
		's': { side: 'left', direction: 'down' },
		'arrowup': { side: 'right', direction: 'up' },
		'arrowdown': { side: 'right', direction: 'down' },
	};

	#gameState: Game['GameStatus'] | null = null;

	#keyBindings: GameKeyBindings;
	#props: GameComponentProps = {
		gameId: '',
		gameType: 'VS',
		isLocalGame: true,
	};

	#leftPlayerActive = false;
	#rightPlayerActive = false;

	private onMovement?: GameComponentMovementHandler;

	#canvas: HTMLCanvasElement | null = null;
	#ctx: CanvasRenderingContext2D | null = null;

	#handleKeyDown: typeof this.handleKeyDown;
	#handleKeyUp: typeof this.handleKeyUp;


	#handleButtonStart = this.handleButtonStart.bind(this);
	#handleButtonEnd = this.handleButtonEnd.bind(this);

	constructor(props: Partial<GameComponentProps> = {}) {
		super();
		this.updateProps(props);
		this.#keyBindings = { ...this.defaultKeyBindings };

		this.#handleKeyDown = this.handleKeyDown.bind(this);
		this.#handleKeyUp = this.handleKeyUp.bind(this);
	}

	// PUBLIC METHODS--------------------------------------------------------------------------------

	public updateCanvasSize() {
		if (!this.#canvas || !this.#ctx) return;
		this.#canvas.width = this.#canvas.clientWidth;
		this.#canvas.height = this.#canvas.clientHeight;
		this.#ctx.fillStyle = '#000';
		this.#ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height);
	}

	public updateGameState(state: Game['GameStatus']) {
		this.#gameState = state;
		const $debugContainer = document.getElementById(`${this.id}-debug-container`);

		if (!$debugContainer){
			console.warn('Debug container not found');
			return;
		} else {
			if (this.#gameState.debug) {
				$debugContainer.classList.remove('hidden');
			} else {
				$debugContainer.classList.add('hidden');
			}
		}


		this.#updateGameStateElements();

		const ctx = this.#ctx!;
		const canvas = this.#canvas!;

		// clear
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// middle line
		ctx.strokeStyle = '#FFF';
		ctx.setLineDash([5, 15]);
		ctx.beginPath();
		ctx.moveTo(canvas.width / 2, 0);
		ctx.lineTo(canvas.width / 2, canvas.height);
		ctx.stroke();

		this.#drawPaddles(state.paddles);
		this.#drawBall(state.ball);
		this.#drawScore(state.scores);

		ctx.font = '36px Arial';
		ctx.textAlign = 'center';
		const leftUsername = (state.leftPlayer?.username || 'P1').toUpperCase();
		ctx.fillText(
			leftUsername,
			canvas.width * 0.25,
			30
		);


		const rightUsername = (state.rightPlayer?.username || 'P2').toUpperCase();
		ctx.fillText(
			rightUsername,
			canvas.width * 0.75,
			30
		);

		// Overlay: paused/finish labels
		if (state.state === 'PAUSE' || state.state === 'FINISH') {
			ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			ctx.fillStyle = 'white';
			ctx.font = '36px Arial';
			ctx.textAlign = 'center';
			ctx.fillText(
				state.state,
				canvas.width / 2,
				canvas.height / 2
			);
		}

		// Countdown overlay: show 3-2-1-START if countdown active
		if (typeof state.countdownEndsAt === 'number' && state.countdownEndsAt > Date.now()) {
			const msLeft = state.countdownEndsAt - Date.now();
			const secondsLeft = Math.ceil(msLeft / 1000);
			const label = secondsLeft > 0 ? `${secondsLeft}` : 'START';

			ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			ctx.fillStyle = '#f59e0b'; // amber-500 to match UI accents
			ctx.font = 'bold 72px Arial';
			ctx.textAlign = 'center';
			ctx.fillText(
				label,
				canvas.width / 2,
				canvas.height / 2
			);
		}
	}

	public updateProps(props: Partial<GameComponentProps>) {
		this.#props = {
			...this.#props,
			...props,
		};
	}
	public showError(error: string) {
		toast.error('Error', error);
		const errorContainer = document.getElementById(`${this.id}-error-container`)!;
		const errorMessage = document.getElementById(`${this.id}-error-message`)!;
		errorContainer.classList.remove('!hidden');
		errorMessage.innerHTML = error;
	}
	public hideError() {
		const errorContainer = document.getElementById(`${this.id}-error-container`)!;
		errorContainer.classList.add('!hidden');
	}

	/**
	 * Any movement happening inside the GameComponent will call this handler so the parent component can handle it.
	 * @param handler The handler to call on movement
	 */
	public setMovementHandler(handler: GameComponentMovementHandler) {
		this.onMovement = handler;
	}

	public setActivePlayers(left: boolean, right: boolean) {
		this.#leftPlayerActive = left;
		this.#rightPlayerActive = right;

		const $leftPlayerControls = document.querySelectorAll('.controls-left-player');
		const $rightPlayerControls = document.querySelectorAll('.controls-right-player');

		$leftPlayerControls?.forEach(el => el.classList.toggle('invisible', !left));
		$rightPlayerControls?.forEach(el => el.classList.toggle('invisible', !right));
	}

	/**
	 * Programmatically move the player's paddle
	 * @param side player side
	 * @param direction player direction
	 * @returns void
	 */
	public onMovementPressed(side: GameKeyBindings[string]['side'], direction: GameKeyBindings[string]['direction']) {
		if (side === 'left' && !this.#leftPlayerActive) return;
		if (side === 'right' && !this.#rightPlayerActive) return;
		this.onMovement?.(side, direction, 'press');
	}
	public onMovementReleased(side: GameKeyBindings[string]['side'], direction: GameKeyBindings[string]['direction']) {
		if (side === 'left' && !this.#leftPlayerActive) return;
		if (side === 'right' && !this.#rightPlayerActive) return;
		this.onMovement?.(side, direction, 'release');
	}

	public updateKeyBindings(bindings: GameKeyBindings) {
		this.#keyBindings = { ...bindings };
	}

	//-----------------------------------------------------------------------------------------------


	async render() {
		return /*html*/`
			<div id="${this.id}-game" class="relative w-full h-full aspect-square flex flex-col bg-black/50">
				<!-- TODO: debug info, remove it later -->
				<div id="${this.id}-debug-container" class="absolute top-0 left-0 hidden text-sm">
					<span class="font-bold text-xl">DBG GAME STATE</span>
					<p id="${this.id}-game-state">${this.#gameState}</p>
				</div>
				<div class="flex flex-col grow bg-black/50 w-full items-center justify-center">
					<canvas id="${this.id}-game-canvas" class="w-full aspect-[4/3]"></canvas>
				</div>
				<div id="${this.id}-error-container" class="absolute top-0 left-0 z-20 w-full h-full bg-black/50 flex flex-col justify-center items-center !hidden">
					<h4 id="${this.id}-error-message" class="text-red-500"></h4>

					<a href="/play" data-route="/play" class="route-link nav-route" data-i18n="${k('generic.go_back')}">
						Go back
					</a>
				</div>

				<!-- Mobile Controls -->
				<div class="flex sm:hidden justify-between w-full p-4 pb-8">
					<!-- Left Controls -->
					<div class="flex gap-2 controls-left-player">
						<button data-side="left" data-direction="up" class="w-16 h-16 bg-zinc-800/80 rounded-xl active:bg-zinc-700 flex items-center justify-center touch-none select-none">
							<i class="fa fa-arrow-up text-2xl"></i>
						</button>
						<button data-side="left" data-direction="down" class="w-16 h-16 bg-zinc-800/80 rounded-xl active:bg-zinc-700 flex items-center justify-center touch-none select-none">
							<i class="fa fa-arrow-down text-2xl"></i>
						</button>
					</div>

					<!-- Right Controls -->
					<div class="flex gap-2 controls-right-player">
						<button data-side="right" data-direction="up" class="w-16 h-16 bg-zinc-800/80 rounded-xl active:bg-zinc-700 flex items-center justify-center touch-none select-none">
							<i class="fa fa-arrow-up text-2xl"></i>
						</button>
						<button data-side="right" data-direction="down" class="w-16 h-16 bg-zinc-800/80 rounded-xl active:bg-zinc-700 flex items-center justify-center touch-none select-none">
							<i class="fa fa-arrow-down text-2xl"></i>
						</button>
					</div>
				</div>
			</div>
		`;
	}

	protected async postRender() {
		this.#canvas = document.getElementById(`${this.id}-game-canvas`)! as HTMLCanvasElement;
		this.#ctx = this.#canvas.getContext('2d')!;

		this.#initCanvasData();

		this.#updateGameStateElements();

		document.addEventListener('keydown', this.#handleKeyDown);
		document.addEventListener('keyup', this.#handleKeyUp);

		this.#setupMobileControls();
	}

	#setupMobileControls() {
		const buttons = document.querySelectorAll('[data-side][data-direction]');

		buttons.forEach(button => {
			button.addEventListener('mousedown', this.#handleButtonStart);
			button.addEventListener('mouseup', this.#handleButtonEnd);
			button.addEventListener('mouseleave', this.#handleButtonEnd);
			button.addEventListener('touchstart', this.#handleButtonStart);
			button.addEventListener('touchend', this.#handleButtonEnd);
			button.addEventListener('touchcancel', this.#handleButtonEnd);
		});
	}

	private handleButtonStart(e: Event) {
		e.preventDefault();
		const button = e.currentTarget as HTMLElement;
		const side = button.dataset.side as 'left' | 'right';
		const direction = button.dataset.direction as 'up' | 'down';

		if (!side || !direction) return;

		this.onMovementPressed(side, direction);
	}

	private handleButtonEnd(e: Event) {
		const button = e.currentTarget as HTMLElement;
		const side = button.dataset.side as 'left' | 'right';
		const direction = button.dataset.direction as 'up' | 'down';

		if (!side || !direction) return;

		this.onMovementReleased(side, direction);
	}

	private handleKeyDown(event: KeyboardEvent) {
		const key = event.key.toLowerCase();
		const binding = this.#keyBindings[key];

		if (!binding) return;

		// Prevent default behavior for game keys
		event.preventDefault();

		this.onMovementPressed(binding.side, binding.direction);
	}

	private handleKeyUp(event: KeyboardEvent) {
		const key = event.key.toLowerCase();
		const binding = this.#keyBindings[key];

		if (!binding) return;

		event.preventDefault();

		this.onMovementReleased(binding.side, binding.direction);
	}


	#initCanvasData() {
		const canvas = this.#canvas!;
		const ctx = this.#ctx!;
		canvas.width = canvas.clientWidth;
		canvas.height = canvas.clientHeight;
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}


	#drawPaddles(paddles: Game['Paddles']) {
		const ctx = this.#ctx!;
		const canvas = this.#canvas!;

		ctx.fillStyle = '#FFF';
		const paddleHeight = canvas.height / 100 * 20; // 20% of height

		// Left paddle (at x=5% - PADDLE_WIDTH)
		ctx.fillRect(
			canvas.width / 100 * 5 - PADDLE_WIDTH,
			(paddles.left / 100) * canvas.height - paddleHeight / 2,
			PADDLE_WIDTH,
			paddleHeight
		);

		// Right paddle (at x=95%)
		ctx.fillRect(
			canvas.width / 100 * 95,
			(paddles.right / 100) * canvas.height - paddleHeight / 2,
			PADDLE_WIDTH,
			paddleHeight
		);
	}

	#drawBall(ball: Game['Ball']) {
		const ctx = this.#ctx!;
		const canvas = this.#canvas!;

		ctx.fillStyle = '#FFF';
		ctx.beginPath();
		ctx.arc(
			(ball.x / 100) * canvas.width,
			(ball.y / 100) * canvas.height,
			BALL_SIZE,
			0,
			Math.PI * 2
		);
		ctx.fill();
	}

	#drawScore(scores: Game['Scores']) {
		const ctx = this.#ctx!;
		const canvas = this.#canvas!;

		ctx.fillStyle = '#FFF';
		ctx.font = 'bold 16px Arial';
		ctx.textAlign = 'center';

		ctx.fillText(
			scores.left.toString(),
			canvas.width * 0.25,
			60
		);


		ctx.fillText(
			scores.right.toString(),
			canvas.width * 0.75,
			60
		);
	}


	#updateGameStateElements() {
		document.getElementById(`${this.id}-game-state`)!.textContent = JSON.stringify(this.#gameState, null, 2);
	}

	protected async destroy() {
		window.removeEventListener('keydown', this.#handleKeyDown);
		window.removeEventListener('keyup', this.#handleKeyUp);

		const buttons = document.querySelectorAll('[data-side][data-direction]');
		buttons.forEach(button => {
			button.removeEventListener('mousedown', this.#handleButtonStart);
			button.removeEventListener('mouseup', this.#handleButtonEnd);
			button.removeEventListener('mouseleave', this.#handleButtonEnd);
			button.removeEventListener('touchstart', this.#handleButtonStart);
			button.removeEventListener('touchend', this.#handleButtonEnd);
			button.removeEventListener('touchcancel', this.#handleButtonEnd);
		});

		this.#canvas = null;
		this.#ctx = null;
		this.#gameState = null;
		this.onMovement = undefined;
		this.#keyBindings = {};
	}
}
