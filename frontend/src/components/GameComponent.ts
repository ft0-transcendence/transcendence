import { Game } from "@shared";
import { authManager } from "@src/tools/AuthManager";
import { k, t } from "@src/tools/i18n";
import toast from "@src/tools/Toast";
import { ComponentController } from "@src/tools/ViewController";
import { isMobile } from '../utils/agentUtils';
import { getProfilePictureUrlByUserId } from "@src/utils/getImage";
import { DefaultEventsMap } from "socket.io";

import {Socket} from 'socket.io-client'

export type GameComponentProps = {

	socketConnection?: Socket;

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


	#connectedUsers: Game['GameUserInfo'][] = [];

	#gameFinished = false;
	#gameState: Game['GameStatus'] | null = null;

	#keyBindings: GameKeyBindings;
	#props: GameComponentProps = {
		gameId: '',
		gameType: 'VS',
		isLocalGame: true,
	};

	#leftPlayerData: Game['GameUserInfo'] | null = null;
	#rightPlayerData: Game['GameUserInfo'] | null = null;

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
		this.updatePartialProps(props);
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


	#fillUserInfo(user: Game['GameUserInfo'] | null, containerId: string, score: number, shouldUpdateUserInfo = false) {
		if (!user) {
			return;
		};
		const $container = document.getElementById(containerId);
		if (!$container) {
			console.warn('User info container not found');
			return;
		}
		if (shouldUpdateUserInfo){
			const $image = $container.querySelector('.game-user-image') as HTMLImageElement;

			const isLocalGame = this.#props.isLocalGame;
			if (user.isPlayer && shouldUpdateUserInfo && !isLocalGame) {
				if ($image) {
					$image.src = getProfilePictureUrlByUserId(user.id);
					$image.classList.remove('hidden');
				}
			} else {
				$image?.classList.add('hidden');
			}
			const $username = $container.querySelector('.game-user-username') as HTMLElement;
			$username.textContent = user.username;
		}

		const $score = $container.querySelector('.game-user-score') as HTMLElement;
		$score.textContent = String(score);
	}

	public updateGameState(state: Game['GameStatus']) {
		if (this.#gameFinished) return;
		this.#gameState = state;

		this.#fillUserInfo(state.leftPlayer, `${this.id}-left-user`, state.scores.left, this.#leftPlayerData == null);
		this.#fillUserInfo(state.rightPlayer, `${this.id}-right-user`, state.scores.right, this.#rightPlayerData == null);

		this.#leftPlayerData = state.leftPlayer;
		this.#rightPlayerData = state.rightPlayer;

		const $debugContainer = document.getElementById(`${this.id}-debug-container`);

		if (!$debugContainer) {
			console.warn('Debug container not found');
			return;
		} else {
			if (this.#gameState.debug) {
				$debugContainer.classList.remove('hidden');
			} else {
				$debugContainer.classList.add('hidden');
			}
		}
		if (!state.rightPlayer?.isPlayer) {
			this.#rightPlayerActive = false;
		}
		if (!state.leftPlayer?.isPlayer) {
			this.#leftPlayerActive = false;
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

		// Overlay: paused/finish labels
		//state.state === 'PAUSE' ||
		if (state.state === 'FINISH') {
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

		if (state.state === "FINISH") {
			this.#destroyGameEventListeners();
			this.#unsubscribeFromSocketEvents(this.#props.socketConnection);
			this.#gameFinished = true;
			document.querySelector(`${this.id}-exit-container`)?.classList.remove('!hidden');
		}
	}

	public updatePartialProps(props: Partial<GameComponentProps>) {
		const prevSocketConnection = this.#props.socketConnection;
		this.#props = {
			...this.#props,
			...props,
		};
		this.#setupSocketEvents(prevSocketConnection, props.socketConnection);
	}


	public showError(error: string) {
		toast.error('Error', error);
		const errorContainer = document.getElementById(`${this.id}-exit-container`)!;
		const errorMessage = document.getElementById(`${this.id}-error-message`)!;
		errorContainer.classList.remove('!hidden');
		errorMessage.innerHTML = error;
	}
	public hideError() {
		const errorContainer = document.getElementById(`${this.id}-exit-container`)!;
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

		const isMobileDevice = isMobile();

		const $leftPlayerControls = document.querySelectorAll('.controls-left-player');
		const $rightPlayerControls = document.querySelectorAll('.controls-right-player');
		$leftPlayerControls?.forEach(el => {
			el.classList.toggle('!hidden', !left || !isMobileDevice);
			el.classList.toggle('flex-col', right);
		});
		$rightPlayerControls?.forEach(el => {
			el.classList.toggle('!hidden', !right || !isMobileDevice);
			el.classList.toggle('flex-col', left);
		});

		if (!left && !right) {
			document.querySelector(`${this.id}-mobile-controls`)?.classList.add('!hidden');
		} else {
			document.querySelector(`${this.id}-mobile-controls`)?.classList.remove('!hidden');
		}
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

	#setupSocketEvents(prevSocketConnection: Socket | null | undefined, socketConnection: Socket | null | undefined) {
		if (prevSocketConnection){
			this.#unsubscribeFromSocketEvents(prevSocketConnection);
		}
		if (socketConnection) {
			this.#props.socketConnection = socketConnection;
			this.#subscribeToSocketEvents(socketConnection);
		} else {
			this.#props.socketConnection = undefined;
		}
	}

	#subscribeToSocketEvents(socket: Socket) {
		const messageContainer = document.querySelector(`#${this.id}-game-overlay-message-container`);

		socket.on('game-state', (data: Game['GameStatus']) => {
			this.updateGameState(data);
		});

		socket.on('player-joined', (user: Game['GameUserInfo']) => {
			console.debug('Player joined', user);
			this.#connectedUsers.push(user);
		});

		socket.on('player-left', (user: Game['GameUserInfo']) => {
			console.debug('Player left', user);
			document.querySelector(`#game-connected-user-${user.id}`)?.remove();
			this.#connectedUsers = this.#connectedUsers.filter(p => p.id !== user.id);
		});

		socket.on('game-aborted', (data: {reason: string, disconnectedPlayerId: string, disconnectedPlayerName: string, winnerName: string, message: string}) => {
			if (!messageContainer) return;
			console.debug('Game aborted', data);
			if (this.#gameState){
				this.#gameState.state = 'FINISH' as Game['GameStatus']['state'];
				this.#gameState.leftPlayer = null;
				this.#gameState.rightPlayer = null;
				this.#gameState.scores.left = 0;
				this.#gameState.scores.right = 0;
				this.updateGameState(this.#gameState);
				this.#unsubscribeFromSocketEvents(this.#props.socketConnection);
			}

			messageContainer.innerHTML = /*html*/`
				<div class="flex flex-col gap-2 items-center justify-center bg-black/50 p-2">
					<div class="flex items-center justify-center text-xl text-center">${data.message}</div>

					<a data-route="/play" href="/play" class="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-400 transition-colors">
						<i class="fa fa-arrow-left"></i>
						<span class="ml-1" data-i18n="${k('generic.go_back')}">Go back</span>
					</a>
				</div>
			`;
			messageContainer.classList.remove('!hidden');
		});

		socket.on('player-disconnected', (data: {userId: string, playerName: string, expiresAt: number, gracePeriodMs: number, timeLeftMs: number}) => {
			if (!messageContainer) return;
			console.debug('Player disconnected', data);
			const playerName = data.playerName;
			const timeLeftMs = data.timeLeftMs;
			if (this.#gameState){
				this.#gameState.countdownEndsAt = null;
				this.updateGameState(this.#gameState);
			}

			messageContainer.innerHTML = /*html*/`
				<div class="flex flex-col gap-2 items-center justify-center p-2">
					<h4 class="text-xl">${t('game.player_disconnected', { playerName })}</h4>
					<p>${t('game.time_left_before_forfeit', { timeLeftMs: Math.ceil(timeLeftMs / 1000) })}</p>
				</div>
			`;
			messageContainer.classList.remove('!hidden');
		});

		socket.on('disconnection-timer-update', (data: {userId: string, playerName: string, expiresAt: number, gracePeriodMs: number, timeLeftMs: number}) => {
			if (!messageContainer) return;
			console.debug('Player disconnection timer update', data);
			const playerName = data.playerName;
			const timeLeftMs = data.timeLeftMs;

			messageContainer.innerHTML = /*html*/`
				<div class="flex flex-col gap-2 items-center justify-center bg-black/50 p-2">
					<h4 class="text-xl">${t('game.player_disconnected', { playerName })}</h4>
					<p>${t('game.time_left_before_forfeit', { timeLeftMs: Math.ceil(timeLeftMs / 1000) })}</p>
				</div>
			`;
			messageContainer.classList.remove('!hidden');
		});

		socket.on('player-reconnected', (data: {userId: string, playerName: string}) => {
			if (!messageContainer) return;
			console.debug('Player reconnected', data);

			messageContainer.classList.add('!hidden');
		})
	}



	#unsubscribeFromSocketEvents(socket?: Socket) {
		if (!socket) return;

		// TODO: unsubscribe from all socket events
		socket.off('game-state');
		socket.off('player-joined');
		socket.off('player-left');
		socket.off('game-aborted');
		socket.off('player-disconnected');
		socket.off('disconnection-timer-update');
		socket.off('player-reconnected');
	}

	//-----------------------------------------------------------------------------------------------


	async render() {
		return /*html*/`
			<div id="${this.id}-game" class="relative w-full h-full aspect-square flex flex-col bg-black/50">
				<div id="${this.id}-debug-container" class="absolute top-0 left-0 hidden text-sm">
					<span class="font-bold text-xl">DBG GAME STATE</span>
					<p id="${this.id}-game-state">${this.#gameState}</p>
				</div>

				<div class="flex flex-col grow bg-black/50 w-full items-center justify-center">
					<div class="grid grid-cols-2 gap-2 px-4 py-2 grid-flow-row uppercase w-full items-center shrink-0 text-white">
						<!-- LEFT USER -->
						<section id="${this.id}-left-user" class="flex flex-col items-center justify-center">
							<div class="flex items-center justify-center gap-1">
								<div class="game-user-username font-mono text-xs sm:text-xl font-bold"></div>
								<img class="game-user-image hidden h-8 w-8 sm:h-12 sm:w-12 object-cover rounded-full overflow-hidden"/>
							</div>
							<div class="flex flex-col items-center justify-center">
								<span class="game-user-score text-xl font-bold"></span>
							</div>
						</section>

						<!-- RIGHT USER -->
						<section id="${this.id}-right-user" class="flex flex-col items-center justify-center">
							<div class="flex items-center justify-center gap-1">
								<img class="game-user-image hidden h-8 w-8 sm:h-12 sm:w-12 object-cover rounded-full overflow-hidden"/>
								<div class="game-user-username font-mono text-xs sm:text-xl font-bold"></div>
							</div>
							<div class="flex flex-col items-center justify-center">
								<span class="game-user-score text-xl font-bold"></span>
							</div>
						</section>
					</div>
					<canvas id="${this.id}-game-canvas" class="w-full aspect-[4/3] border border-white"></canvas>
					<div id="${this.id}-game-overlay-message-container" class="absolute top-0 left-0 z-20 w-full h-full bg-black/50 flex flex-col justify-center items-center !hidden">
					</div>
				</div>
				<div id="${this.id}-exit-container" class="absolute top-0 left-0 z-20 w-full h-full bg-black/50 flex flex-col justify-center items-center !hidden">
					<h4 id="${this.id}-error-message" class="text-red-500"></h4>

					<a data-route="/play" href="/play" class="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-400 transition-colors">
						<i class="fa fa-arrow-left"></i>
						<span class="ml-1" data-i18n="${k('generic.go_back')}">Go back</span>
					</a>

				</div>

				<!-- Mobile Controls -->
				<div id="${this.id}-mobile-controls" class="flex justify-evenly w-full p-4 pb-8">
					<!-- Left Controls -->
					<div class="flex flex-col gap-2 controls-left-player grow justify-evenly items-center">
						<button data-side="left" data-direction="up" class="w-16 h-16 bg-zinc-800/80 rounded-xl active:bg-zinc-700 flex items-center justify-center touch-none select-none">
							<i class="fa fa-arrow-up text-2xl"></i>
						</button>
						<button data-side="left" data-direction="down" class="w-16 h-16 bg-zinc-800/80 rounded-xl active:bg-zinc-700 flex items-center justify-center touch-none select-none">
							<i class="fa fa-arrow-down text-2xl"></i>
						</button>
					</div>

					<!-- Right Controls -->
					<div class="flex flex-col gap-2 controls-right-player grow justify-evenly items-center">
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
		// event.preventDefault();

		this.onMovementPressed(binding.side, binding.direction);
	}

	private handleKeyUp(event: KeyboardEvent) {
		const key = event.key.toLowerCase();
		const binding = this.#keyBindings[key];

		if (!binding) return;

		// event.preventDefault();

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


	//TODO: improve the usage of hard-coded values (e.g., PADDLE_WIDTH)
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

	#updateGameStateElements() {
		document.getElementById(`${this.id}-game-state`)!.textContent = JSON.stringify(this.#gameState, null, 2);
	}

	protected async destroy() {

		this.#destroyGameEventListeners();

		this.#canvas = null;
		this.#ctx = null;
		this.#gameState = null;
	}

	#destroyGameEventListeners() {
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


		this.onMovement = undefined;
		this.#keyBindings = {};
	}
}
