import { authManager } from "@src/tools/AuthManager";
import { k } from "@src/tools/i18n";
import { Game } from "@tools/Game";
import { RouteController } from "@tools/ViewController";

export class LandingPageController extends RouteController {
	private animationFrameId: number = 0;
	private canvas: HTMLCanvasElement | null = null;
	private ctx: CanvasRenderingContext2D | null = null;
	private game: Game;
	private lastTime: number = 0;

	constructor() {
		super();
		this.game = new Game();
	}

	async render() {
		return /*html*/`
			<div class="relative flex flex-col grow w-full items-center justify-center">
				<canvas id="pong-canvas" class="absolute top-0 left-0 w-full h-full opacity-25"></canvas>
				<div class="flex flex-col items-center gap-8 justify-center text-center">
					<h1 class="text-6xl font-bold mb-4">Pong Game</h1>
					<p class="text-xl text-center max-w-2xl mb-8" data-i18n="${k('landing_page.description')}">
						Welcome to the classic Pong experience! Challenge your friends or improve your skills
						in this timeless game of digital table tennis. Simple to learn, hard to master.
					</p>
					<div class="flex flex-col sm:flex-row gap-4">
						<button data-route="/play" data-i18n="${k('navbar.start_playing')}" class="bg-teal-700 cursor-pointer uppercase px-6 py-2 rounded-md drop-shadow-md drop-shadow-black hover:drop-shadow-teal-950 active:drop-shadow-teal-950 font-mono text-xl font-bold">
							Start Playing
						</button>
						<button id="${this.id}-login-btn" data-i18n="${k('navbar.login')}" class="bg-rose-800 cursor-pointer uppercase px-6 py-2 rounded-md drop-shadow-md drop-shadow-black hover:drop-shadow-rose-950 active:drop-shadow-rose-950 font-mono text-xl font-bold">
							Sign In
						</button>
					</div>
				</div>
			</div>
        `;
	}

	async postRender() {
		this.#setupCanvas();
		this.game.start();

		this.startAnimation();
		this.simulateAIMovement();

		document.querySelector(`#${this.id}-login-btn`)?.addEventListener('click', () => {
			authManager.login();
		}, {once: true});

		window.addEventListener('resize', this.#updateCanvasSize.bind(this));
	}

	#setupCanvas() {
		this.canvas = document.querySelector('#pong-canvas');
		if (this.canvas) {
			this.#updateCanvasSize();
			this.ctx = this.canvas.getContext('2d');
			this.game.updatePartialConfig({
				maxScore: -1,
				gameStartCountdown: 500,
			})
		}
	}

	#updateCanvasSize() {
		if (this.canvas) {
			this.canvas.width = this.canvas.clientWidth;
			this.canvas.height = this.canvas.clientHeight;
		}
	}

	// TODO: improve it :)
	// CHATGPT START=================================================================================
	private startAnimation() {
		this.simulateAIMovement();
	}

	private simulateAIMovement() {
		const animate = (currentTime: number) => {
			if (this.lastTime) {
				const delta = currentTime - this.lastTime;

				const state = this.game.getState();

				const leftTarget = state.ball.dirX < 0 ? state.ball.y : 50;
				const leftDiff = leftTarget - state.paddles.left;
				if (Math.abs(leftDiff) > 1) {
					this.game.movePaddle("left", leftDiff > 0 ? "down" : "up");
				}

				const rightTarget = state.ball.dirX > 0 ? state.ball.y : 50;
				const rightDiff = rightTarget - state.paddles.right;
				if (Math.abs(rightDiff) > 1) {
					this.game.movePaddle("right", rightDiff > 0 ? "down" : "up");
				}

				this.game.update(delta);
				this.drawFrame();
			}
			this.lastTime = currentTime;
			this.animationFrameId = requestAnimationFrame(animate);
		};
		requestAnimationFrame(animate);
	}

	private drawFrame() {
		if (!this.ctx || !this.canvas) return;

		const state = this.game.getState();

		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

		const scaleX = this.canvas.width / 100;
		const scaleY = this.canvas.height / 100;

		this.ctx.save();
		this.ctx.scale(scaleX, scaleY);

		this.ctx.setLineDash([5]);
		this.ctx.beginPath();
		this.ctx.moveTo(50, 0);
		this.ctx.lineTo(50, 100);
		this.ctx.strokeStyle = '#444';
		this.ctx.lineWidth = 1;
		this.ctx.stroke();

		const paddleWidth = 2;
		const paddleHeight = this.game.currentConfig.paddleHeightPercentage;

		this.roundedRect(
			this.ctx,
			5,
			state.paddles.left - paddleHeight / 2,
			paddleWidth,
			paddleHeight,
			1
		);

		this.roundedRect(
			this.ctx,
			95 - paddleWidth,
			state.paddles.right - paddleHeight / 2,
			paddleWidth,
			paddleHeight,
			1
		);

		const ballRadius = 1.5;
		this.ctx.save();

		this.ctx.scale(1 / scaleX, 1 / scaleY);
		this.ctx.beginPath();
		this.ctx.arc(
			state.ball.x * scaleX,
			state.ball.y * scaleY,
			ballRadius * Math.min(scaleX, scaleY),
			0,
			Math.PI * 2
		);
		this.ctx.fillStyle = '#2563eb';
		this.ctx.fill();
		this.ctx.restore();

		this.ctx.restore();
	}

	private roundedRect(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		width: number,
		height: number,
		radius: number
	) {
		ctx.fillStyle = '#2563eb';
		ctx.beginPath();
		ctx.moveTo(x + radius, y);
		ctx.lineTo(x + width - radius, y);
		ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
		ctx.lineTo(x + width, y + height - radius);
		ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
		ctx.lineTo(x + radius, y + height);
		ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
		ctx.lineTo(x, y + radius);
		ctx.quadraticCurveTo(x, y, x + radius, y);
		ctx.closePath();
		ctx.fill();
	}
	// CHATGPT END=================================================================================

	onDestroy() {
		window.removeEventListener('resize', this.#updateCanvasSize.bind(this));
		cancelAnimationFrame(this.animationFrameId);
	}
}
