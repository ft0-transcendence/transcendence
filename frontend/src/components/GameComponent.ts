import { Game, GameType, GameUserInfo, GameStatus } from "@shared";
import { k } from "@src/tools/i18n";
import toast from "@src/tools/Toast";
import { ComponentController } from "@src/tools/ViewController";

export type GameComponentProps = {

	gameId: string;
	gameType: GameType;

	isLocalGame: boolean;
}
// TODO: move to backend and retrieve it from socket?
const PADDLE_WIDTH = 10;
const BALL_SIZE = 6.9;


export class GameComponent extends ComponentController {
	#props: GameComponentProps = {
		gameId: '',
		gameType: 'VS',
		isLocalGame: true,
	};

	#gameState: GameStatus | null = null;

	#gameCanvas: HTMLCanvasElement | null = null;
	#ctx: CanvasRenderingContext2D | null = null;

	constructor(props: Partial<GameComponentProps> = {}) {
		super();
		this.updateProps(props);
	}

	async render() {
		return /*html*/`
			<div id="${this.id}-game" class="relative w-full h-full aspect-square flex flex-col bg-black/50">
				<div class="absolute top-0 left-0">
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
			</div>
		`;
	}

	protected async postRender() {
		this.#gameCanvas = document.getElementById(`${this.id}-game-canvas`)! as HTMLCanvasElement;
		this.#ctx = this.#gameCanvas.getContext('2d')!;

		this.#initCanvasData();

		this.#updateGameStateElements();
	}

	#initCanvasData() {
		const canvas = this.#gameCanvas!;
		const ctx = this.#ctx!;
		canvas.width = canvas.clientWidth;
		canvas.height = canvas.clientHeight;
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}

	protected async destroy() {
		// TODO: cleanup events

	}

	#drawPaddles(paddles: Game['paddles']) {
		const ctx = this.#ctx!;
		const canvas = this.#gameCanvas!;

		ctx.fillStyle = '#FFF';
		const paddleHeight = canvas.height / 100 * 20;

		ctx.fillRect(
			0,
			(paddles.left / 100) * canvas.height,
			PADDLE_WIDTH,
			paddleHeight
		);

		ctx.fillRect(
			canvas.width - PADDLE_WIDTH,
			(paddles.right / 100) * canvas.height,
			PADDLE_WIDTH,
			paddleHeight
		);
	}

	#drawBall(ball: Game['ball']) {
		const ctx = this.#ctx!;
		const canvas = this.#gameCanvas!;

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

	#drawScore(scores: Game['scores']) {
		const ctx = this.#ctx!;
		const canvas = this.#gameCanvas!;

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



	public updateGameState(state: GameStatus) {
		this.#gameState = state;
		this.#updateGameStateElements();

		const ctx = this.#ctx!;
		const canvas = this.#gameCanvas!;

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

		if (state.state !== 'RUNNING') {
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
	}


	#updateGameStateElements() {
		document.getElementById(`${this.id}-game-state`)!.textContent = JSON.stringify(this.#gameState, null, 2);
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

}
