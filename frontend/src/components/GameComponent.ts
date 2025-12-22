import { Game } from "@shared";
import { authManager } from "@src/tools/AuthManager";
import { k, t, updateDOMTranslations } from "@src/tools/i18n";
import toast from "@src/tools/Toast";
import { ComponentController } from "@src/tools/ViewController";
import { isMobile } from '../utils/agentUtils';
import { getProfilePictureUrlByUserId } from "@src/utils/getImage";
import { Socket } from 'socket.io-client';

export type GameComponentProps = {
	socketConnection?: Socket;
	gameId: string;
	gameType: Game['GameType'];
	isLocalGame: boolean;
	onGameFinished?: () => void;
	goBackPath?: string;
}

export type GameComponentMovementHandler = (
	side: GameKeyBindings[string]['side'],
	direction: GameKeyBindings[string]['direction'],
	type: 'press' | 'release'
) => void;

type GameKeyBindings = {
	[key: string]: {
		side: 'left' | 'right';
		direction: Game['MovePaddleAction']
	}
}

export class GameComponent extends ComponentController {
	// Constants
	readonly defaultKeyBindings: GameKeyBindings = {
		'w': { side: 'left', direction: 'up' },
		's': { side: 'left', direction: 'down' },
		'arrowup': { side: 'right', direction: 'up' },
		'arrowdown': { side: 'right', direction: 'down' },
	};

	private static readonly PADDLE_WIDTH = 20;
	private static readonly BALL_SIZE = 6.9;

	// Fields
	#props: GameComponentProps = {
		gameId: '',
		gameType: 'VS',
		isLocalGame: true,
	};

	#keyBindings: GameKeyBindings;
	#connectedUsers: Game['GameUserInfo'][] = [];
	#gameState: Game['GameStatus'] | null = null;
	#gameFinished = false;

	#leftPlayerData: Game['GameUserInfo'] | null = null;
	#rightPlayerData: Game['GameUserInfo'] | null = null;
	#leftPlayerActive = false;
	#rightPlayerActive = false;

	private onMovement?: GameComponentMovementHandler;

	#canvas: HTMLCanvasElement | null = null;
	#ctx: CanvasRenderingContext2D | null = null;
	#gameOverlayContainer: HTMLDivElement | null = null;

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

	// Render
	async render() {
		return /*html*/`
		<div id="${this.id}-game" class="relative w-full h-full aspect-square flex flex-col bg-black/50">
			<div id="${this.id}-debug-container" class="absolute top-0 left-0 hidden text-sm">
				<span class="font-bold text-xl">DBG GAME STATE</span>
				<p id="${this.id}-game-state">${this.#gameState}</p>
			</div>

			<div class="flex flex-col grow bg-black/50 w-full gap-4 items-center justify-center">

				<div id="${this.id}-game-header" class="justify-center items-center flex-col text-center flex !hidden">
					<h4 id="${this.id}-game-goal-title" class="text-2xl font-bold text-amber-400 animate-pulse uppercase"
						data-i18n="${k('game.score_goal')}" data-i18n-vars='{"score_goal": "?"}'
					>
						First to ? wins!
					</h4>
					<h5 id="${this.id}-game-movement-instructions" data-i18n="${k('game.movement_instructions')}" class="text-sm text-neutral-300">
						To move use W, S or ↑, ↓ keys.
					</h5>
				</div>


				<div class="grid grid-cols-2 gap-2 px-4 py-2 grid-flow-row uppercase w-full items-center shrink-0 text-white">
					<section id="${this.id}-left-user" class="flex flex-col items-center justify-center">
						<div class="flex items-center justify-center gap-1">
							<div class="game-user-username font-mono text-xs sm:text-xl font-bold"></div>
							<img class="game-user-image hidden h-8 w-8 sm:h-12 sm:w-12 object-cover rounded-full overflow-hidden"/>
						</div>
						<div class="flex flex-col items-center justify-center">
							<span class="game-user-score text-xl font-bold"></span>
						</div>
					</section>

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

				<div id="${this.id}-game-overlay" class="absolute top-0 left-0 z-20 w-full h-full bg-black/50 flex-col justify-center items-center flex !hidden">
					<div class="bg-black/5 w-full h-full absolute top-0 left-0 -z-10"></div>

					<h4 id="${this.id}-text-message" class="overlay-item !hidden text-xl"></h4>

					<div id="${this.id}-game-overlay-message-container" class="flex-col justify-center items-center text-center flex !hidden w-full"></div>

					<div id="${this.id}-game-overlay-waiting_other_player" class="overlay-item flex-col gap-2 items-center justify-center flex !hidden">
						<h4 class="text-xl" data-i18n="${k('game.waiting_other_player')}">Waiting for other player to join...</h4>
						<div class="flex flex-row gap-2">
							<div class="w-4 h-4 rounded-full bg-neutral-300 animate-bounce"></div>
							<div class="w-4 h-4 rounded-full bg-neutral-300 animate-bounce [animation-delay:-.3s]"></div>
							<div class="w-4 h-4 rounded-full bg-neutral-300 animate-bounce [animation-delay:-.5s]"></div>
						</div>
					</div>

					<a id="${this.id}-exit-button" data-route="/play" href="/play" class="overlay-item items-center gap-2 text-base font-bold text-stone-300 hover:text-stone-200 transition-colors flex !hidden">
						<i class="fa fa-arrow-left"></i>
						<span class="ml-1" data-i18n="${k('generic.go_back')}">Go back</span>
					</a>
				</div>
			</div>

			<div id="${this.id}-mobile-controls" class="flex justify-evenly w-full p-4 pb-8">
				<div class="!hidden flex-col gap-2 controls-left-player grow justify-evenly items-center">
					<button data-side="left" data-direction="up" class="w-16 h-16 bg-zinc-800/80 rounded-xl active:bg-zinc-700 flex items-center justify-center touch-none select-none">
						<i class="fa fa-arrow-up text-2xl"></i>
					</button>
					<button data-side="left" data-direction="down" class="w-16 h-16 bg-zinc-800/80 rounded-xl active:bg-zinc-700 flex items-center justify-center touch-none select-none">
						<i class="fa fa-arrow-down text-2xl"></i>
					</button>
				</div>

				<div class="!hidden flex-col gap-2 controls-right-player grow justify-evenly items-center">
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

		this.#gameOverlayContainer = document.getElementById(`${this.id}-game-overlay`)! as HTMLDivElement;

		if (this.#props.goBackPath) {
			const exitButton = document.getElementById(`${this.id}-exit-button`)! as HTMLAnchorElement;
			exitButton.href = this.#props.goBackPath;
			exitButton.setAttribute('data-route', this.#props.goBackPath);
		}
		if (isMobile()){
			document.querySelector(`#${this.id}-game-movement-instructions`)?.classList.add('!hidden');
		}

		document.addEventListener('keydown', this.#handleKeyDown);
		document.addEventListener('keyup', this.#handleKeyUp);

		this.#setupMobileControls();
	}

	protected async destroy() {
		this.#destroyGameEventListeners();
		this.#unsubscribeFromSocketEvents(this.#props.socketConnection);
		this.#canvas = null;
		this.#ctx = null;
		this.#gameState = null;
	}

	// Movement
	public setMovementHandler(handler: GameComponentMovementHandler) {
		this.onMovement = handler;
	}

	public setActivePlayers(left: boolean, right: boolean) {
		this.#leftPlayerActive = left;
		this.#rightPlayerActive = right;
		this.#updateMobileControlsVisibility();
	}

	public onMovementPressed(side: GameKeyBindings[string]['side'], direction: GameKeyBindings[string]['direction']) {
		if ((side === 'left' && !this.#leftPlayerActive) || (side === 'right' && !this.#rightPlayerActive)) return;
		this.onMovement?.(side, direction, 'press');
	}

	public onMovementReleased(side: GameKeyBindings[string]['side'], direction: GameKeyBindings[string]['direction']) {
		if ((side === 'left' && !this.#leftPlayerActive) || (side === 'right' && !this.#rightPlayerActive)) return;
		this.onMovement?.(side, direction, 'release');
	}

	// Key Bindings
	public updateKeyBindings(bindings: GameKeyBindings) {
		this.#keyBindings = { ...bindings };
	}

	// Canvas
	public updateCanvasSize() {
		if (!this.#canvas || !this.#ctx) return;
		this.#canvas.width = this.#canvas.clientWidth;
		this.#canvas.height = this.#canvas.clientHeight;
		this.#ctx.fillStyle = '#000';
		this.#ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height);
	}

	// Error overlay
	public showError(error: string) {
		toast.error('Error', error);
		this.#toggleGameOverlay(true);
		this.#hideOverlaysExceptFor([`${this.id}-exit-button`, `${this.id}-text-message`]);
		const errorMessage = document.getElementById(`${this.id}-text-message`)!;
		errorMessage.classList.add('!text-red-500');
		errorMessage.innerHTML = error;
	}

	public hideError() {
		this.#hideOverlaysExceptFor();
		const errorMessage = document.getElementById(`${this.id}-text-message`)!;
		errorMessage.classList.remove('!text-red-500');
	}

	// Game State
	public updateGameState(state: Game['GameStatus']) {
		if (this.#gameFinished) return;


		this.#fillUserInfo(state.leftPlayer, `${this.id}-left-user`, state.scores.left, this.#leftPlayerData == null);
		this.#fillUserInfo(state.rightPlayer, `${this.id}-right-user`, state.scores.right, this.#rightPlayerData == null);

		this.#leftPlayerData = state.leftPlayer;
		this.#rightPlayerData = state.rightPlayer;

		if (state && (this.#leftPlayerData?.isPlayer || this.#rightPlayerData?.isPlayer)) {
			const gameScoreGoalElement = document.getElementById(`${this.id}-game-goal-title`);
			gameScoreGoalElement?.setAttribute('data-i18n-vars', JSON.stringify({ score_goal: state.gameScoreGoal }));
			const gameHeaderElement = document.getElementById(`${this.id}-game-header`);
			if (gameHeaderElement){
				gameHeaderElement.classList.remove('!hidden');
				updateDOMTranslations(gameHeaderElement);
			}
		}

		this.#gameState = state;

		this.#renderGameState();
	}

	public updatePartialProps(props: Partial<GameComponentProps>) {
		const prevSocketConnection = this.#props.socketConnection;
		this.#props = { ...this.#props, ...props };
		this.#setupSocketEvents(prevSocketConnection, props.socketConnection);
	}

	//-----------------------------------------------------------------------------------------------
	// Private Helpers
	//-----------------------------------------------------------------------------------------------

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
		const paddleHeight = canvas.height / 100 * 20;

		ctx.fillRect(
			canvas.width / 100 * 5 - GameComponent.PADDLE_WIDTH,
			(paddles.left / 100) * canvas.height - paddleHeight / 2,
			GameComponent.PADDLE_WIDTH,
			paddleHeight
		);

		ctx.fillRect(
			canvas.width / 100 * 95,
			(paddles.right / 100) * canvas.height - paddleHeight / 2,
			GameComponent.PADDLE_WIDTH,
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
			GameComponent.BALL_SIZE,
			0,
			Math.PI * 2
		);
		ctx.fill();
	}

	#updateGameStateElements() {
		document.getElementById(`${this.id}-game-state`)!.textContent = JSON.stringify(this.#gameState, null, 2);
	}

	#handleGameState(state?: Game['GameStatus']['state']) {
		state = state ?? this.#gameState?.state;
		if (!state) return;

		if (state === 'FINISH') {
			this.#destroyGameEventListeners();
			this.#unsubscribeFromSocketEvents(this.#props.socketConnection);
			this.#gameFinished = true;
			this.#toggleGameOverlay(true);
			this.#hideOverlaysExceptFor([`${this.id}-exit-button`, `${this.id}-text-message`]);
			const textMessage = document.getElementById(`${this.id}-text-message`)!;
			if (textMessage){
				textMessage.innerHTML = /*html*/`
					<span data-i18n="${k('game.game_finished')}">Game finished</span>
				`;
			}
			this.#props.onGameFinished?.();
		}

		else if (state === 'TOSTART') {
			this.#toggleGameOverlay(true);
			this.#hideOverlaysExceptFor([`${this.id}-game-overlay-waiting_other_player`]);
		}
		else {
			this.#toggleGameOverlay(false);
			this.#hideOverlaysExceptFor();
		}
	}

	#renderGameState() {
		const state = this.#gameState;
		const ctx = this.#ctx;
		const canvas = this.#canvas;
		if (!state || !ctx || !canvas) return;

		// Clear canvas
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// Draw middle line
		ctx.strokeStyle = '#FFF';
		ctx.setLineDash([5, 15]);
		ctx.beginPath();
		ctx.moveTo(canvas.width / 2, 0);
		ctx.lineTo(canvas.width / 2, canvas.height);
		ctx.stroke();

		this.#drawPaddles(state.paddles);
		this.#drawBall(state.ball);

		// Countdown overlay
		if (typeof state.countdownEndsAt === 'number' && state.countdownEndsAt > Date.now()) {
			const msLeft = state.countdownEndsAt - Date.now();
			const secondsLeft = Math.ceil(msLeft / 1000);
			const label = secondsLeft > 0 ? `${secondsLeft}` : 'START';

			ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.fillStyle = '#f59e0b';
			ctx.font = 'bold 72px Arial';
			ctx.textAlign = 'center';
			ctx.fillText(label, canvas.width / 2, canvas.height / 2);
		}
		this.#handleGameState();
	}

	#fillUserInfo(user: Game['GameUserInfo'] | null, containerId: string, score: number, shouldUpdateUserInfo = false) {
		if (!user) return;

		const $container = document.getElementById(containerId);
		if (!$container) return;

		if (shouldUpdateUserInfo) {
			const $image = $container.querySelector('.game-user-image') as HTMLImageElement;
			const isLocalGame = this.#props.isLocalGame;

			if (user.isPlayer && !isLocalGame && user.id) {
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

	handleKeyDown(event: KeyboardEvent) {
		const key = event.key.toLowerCase();
		const binding = this.#keyBindings[key];
		if (!binding) return;
		this.onMovementPressed(binding.side, binding.direction);
	}

	handleKeyUp(event: KeyboardEvent) {
		const key = event.key.toLowerCase();
		const binding = this.#keyBindings[key];
		if (!binding) return;
		this.onMovementReleased(binding.side, binding.direction);
	}

	#destroyGameEventListeners() {
		document.removeEventListener('keydown', this.#handleKeyDown);
		document.removeEventListener('keyup', this.#handleKeyUp);

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

	#toggleGameOverlay(show: boolean) {
		if (!this.#gameOverlayContainer) return;
		this.#gameOverlayContainer.classList.toggle('!hidden', !show);
		this.#gameOverlayContainer.classList.toggle('flex', show);
	}

	#hideOverlaysExceptFor(showOverlayIds?: string[]) {
		if (!this.#gameOverlayContainer) return;

		if (!showOverlayIds?.length) {
			this.#toggleGameOverlay(false);
		}

		this.#gameOverlayContainer.querySelectorAll('.overlay-item').forEach(el => {
			const id = el.id;
			if (showOverlayIds?.includes(id)) {
				el.classList.remove('!hidden');
			} else {
				el.classList.add('!hidden');
			}
		});
	}

	#updateMobileControlsVisibility() {
		const isMobileDevice = isMobile();

		const $leftPlayerControls = document.querySelectorAll('.controls-left-player');
		const $rightPlayerControls = document.querySelectorAll('.controls-right-player');

		$leftPlayerControls.forEach(el => {
			const hide = !this.#leftPlayerActive || !isMobileDevice;
			el.classList.toggle('!hidden', hide);
			el.classList.toggle('flex', !hide);
			el.classList.toggle('flex-col', this.#rightPlayerActive);
			el.classList.toggle('flex-row-reverse', !this.#rightPlayerActive);
		});

		$rightPlayerControls.forEach(el => {
			const hide = !this.#rightPlayerActive || !isMobileDevice;
			el.classList.toggle('!hidden', hide);
			el.classList.toggle('flex', !hide);
			el.classList.toggle('flex-col', this.#leftPlayerActive);
			el.classList.toggle('flex-row-reverse', !this.#leftPlayerActive);
		});


		document.querySelector(`${this.id}-mobile-controls`)?.classList.toggle('!hidden', !this.#leftPlayerActive && !this.#rightPlayerActive);
	}

	//-----------------------------------------------------------------------------------------------
	// Socket Events
	//-----------------------------------------------------------------------------------------------

	#setupSocketEvents(prevSocket: Socket | undefined, nextSocket: Socket | undefined) {
		if (prevSocket) this.#unsubscribeFromSocketEvents(prevSocket);
		if (nextSocket) {
			this.#props.socketConnection = nextSocket;
			this.#subscribeToSocketEvents(nextSocket);
		} else {
			this.#props.socketConnection = undefined;
		}
	}

	#subscribeToSocketEvents(socket: Socket) {
		const messageContainer = document.querySelector(`#${this.id}-game-overlay-message-container`);

		socket.on('game-state', data => this.updateGameState(data));
		socket.on('player-joined', user => this.#connectedUsers.push(user));
		socket.on('player-left', user => {
			document.querySelector(`#game-connected-user-${user.id}`)?.remove();
			this.#connectedUsers = this.#connectedUsers.filter(p => p.id !== user.id);
		});
		socket.on('game-aborted', data => {
			this.#hideOverlaysExceptFor([`${this.id}-game-overlay-message-container`, `${this.id}-exit-button`]);
			this.#toggleGameOverlay(true);

			const reason = data.reason;
			const messageKey = reason === 'player-disconnection-timeout' ? 'game.aborted.user_not_reconnected' : 'game.aborted.generic';
			const messageVars = reason === 'player-disconnection-timeout' ? { username: data.disconnectedPlayerName } : {};

			if (messageContainer) {
				messageContainer.innerHTML = `<div class="flex flex-col gap-2 items-center justify-center bg-black/50 p-2">
					<div class="flex items-center justify-center text-xl text-center" data-i18n="${messageKey}" data-i18n-vars='${JSON.stringify(messageVars)}'>${data.message}</div>
				</div>`;
				messageContainer.classList.remove('!hidden');
				updateDOMTranslations(messageContainer);
			}
		});
		socket.on('player-disconnected', data => this.#showDisconnectMessage(data));
		socket.on('disconnection-timer-update', data => this.#showDisconnectMessage(data));
		socket.on('player-reconnected', () => {
			this.#hideOverlaysExceptFor();
			if (messageContainer) messageContainer.classList.add('!hidden')
		});
	}

	#unsubscribeFromSocketEvents(socket?: Socket) {
		if (!socket) return;
		socket.off('game-state');
		socket.off('player-joined');
		socket.off('player-left');
		socket.off('game-aborted');
		socket.off('player-disconnected');
		socket.off('disconnection-timer-update');
		socket.off('player-reconnected');
	}

	#showDisconnectMessage(data: any) {
		const messageContainer = document.querySelector(`#${this.id}-game-overlay-message-container`);
		if (!messageContainer) return;

		this.#hideOverlaysExceptFor([`${this.id}-game-overlay-message-container`]);
		this.#toggleGameOverlay(true);
		messageContainer.innerHTML = `<div class="flex flex-col gap-2 items-center justify-center bg-black/50 p-2">
			<h4 class="text-xl">${t('game.player_disconnected', { playerName: data.playerName })}</h4>
			<p>${t('game.time_left_before_forfeit', { timeLeftMs: Math.ceil(data.timeLeftMs / 1000) })}</p>
		</div>`;
		messageContainer.classList.remove('!hidden');
	}
}

