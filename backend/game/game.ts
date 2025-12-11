export enum GameState {
	TOSTART = "TOSTART",
	RUNNING = "RUNNING",
	PAUSE = "PAUSE",
	FINISH = "FINISH"
}

export type MovePaddleAction = "up" | "down";

export interface Ball {
	x: number;
	y: number;
	dirX: number;
	dirY: number;
	velocity: number;
}

export interface Paddles {
	left: number;
	right: number;
}

export interface Scores {
	left: number;
	right: number;
}

export interface GameStatus {
	debug: boolean;

	ball: Ball;
	paddles: Paddles;
	scores: Scores;
	state: GameState;
	gameScoreGoal?: number | null;

	// Timestamp in ms when countdown ends (for 3-2-1 START). Null if not counting.
	countdownEndsAt: number | null;

	leftPlayer: GameUserInfo | null;
	rightPlayer: GameUserInfo | null;
}

export type GameConfig = {
	debug: boolean;

	shouldUseRequestAnimationFrame?: boolean;

	gameStartCountdown: number;
	maxScore?: number | null;

	initialVelocity: number;
	velocityIncrease: number;
	maxVelocity: number;

	paddleSpeed: number;
	movementSensitivity: number;

	paddleHeightPercentage: number;
	paddleWidthPercentage: number;

	initialData?: {
		leftPlayerScore?: number;
		rightPlayerScore?: number;
	}
}

export type GameUserInfo = {
	id: string;
	username: string;
	isPlayer?: boolean;
}

const BALL_RADIUS = 1.5;
const COLLISION_OFFSET = 0.5;
const TARGET_FPS = 120;
const FRAME_TIME_MS = 1000 / TARGET_FPS;

export const STANDARD_GAME_CONFIG: GameConfig = {
	debug: false,
	shouldUseRequestAnimationFrame: false,
	gameStartCountdown: 3000,
	maxScore: 5,
	initialVelocity: 0.05,
	velocityIncrease: 0.000005,
	maxVelocity: 0.16,
	paddleSpeed: 3,
	movementSensitivity: 0.5,
	paddleHeightPercentage: 20,
	paddleWidthPercentage: 5,
};

export class Game {
	protected config: GameConfig;


	private inputState = {
		left: { up: false, down: false },
		right: { up: false, down: false },
	};

	private lastTick: number | null = null;

	public state: GameState;
	public countdown: number | null;
	public ball: Ball;
	public paddles: Paddles;
	public scores: Scores;

	private tickListeners: Array<(state: GameStatus, now: number) => void> = [];

	private scoreListeners: Array<(scores: Scores) => void> = [];

	private _leftPlayer: GameUserInfo | null = null;
	private _rightPlayer: GameUserInfo | null = null;
	private leftPlayerReady: boolean = false;
	private rightPlayerReady: boolean = false;

	constructor(config: Partial<GameConfig> = {}) {
		this.config = {
			...STANDARD_GAME_CONFIG,
			...config
		} as GameConfig;

		this.state = GameState.TOSTART;
		this.countdown = null;

		this.ball = {
			x: 50,
			y: 50,
			dirX: 0,
			dirY: 0,
			velocity: this.config.initialVelocity,
		};

		this.paddles = {
			left:  50,
			right: 50,
		};

		this.scores = {
			left: this.config.initialData?.leftPlayerScore ?? 0,
			right: this.config.initialData?.rightPlayerScore ?? 0,
		};
		if (config.maxScore && config.maxScore <= 0) {
			this.config.maxScore = undefined;
		} else if (config.maxScore === null) {
			this.config.maxScore = undefined;
		}
	}

	public start(): void {
		if (this.state === GameState.TOSTART || this.state === GameState.FINISH) {
			this.state = GameState.RUNNING;
			this.reset();
			if (!this.#loopAnimationInterval) {
				this.startLoop();
			}
		}
	}

	public setPlayers(player1: GameUserInfo, player2: GameUserInfo): void {
		if (!player1 || !player2) {
			throw new Error('Both players must be provided');
		}
		this._leftPlayer = player1;
		this._rightPlayer = player2;
	}

	public playerReady(player: GameUserInfo): void {
		if (this.leftPlayer && this.leftPlayer.id === player.id) {
			this.leftPlayerReady = true;
		} else if (this.rightPlayer && this.rightPlayer.id === player.id) {
			this.rightPlayerReady = true;
		}
		if (this.leftPlayerReady && this.rightPlayerReady) {
			this.start();
		}
	}
	public isPlayerInGame(id: GameUserInfo['id']): boolean {
		return id === this._leftPlayer?.id || id === this._rightPlayer?.id;
	}

	public movePaddle(player: "left" | "right", direction: MovePaddleAction): void {
		if (this.state !== GameState.RUNNING) return;
		if (this.isInCountdown()) return;

		const speed = this.config.paddleSpeed * this.config.movementSensitivity;
		const min = this.config.paddleHeightPercentage / 2;
		const max = 100 - this.config.paddleHeightPercentage / 2;

		if (player === "left") {
			if (direction === "up") this.paddles.left -= speed;
			if (direction === "down") this.paddles.left += speed;
			this.paddles.left = Math.max(min, Math.min(max, this.paddles.left));
		} else if (player === "right") {
			if (direction === "up") this.paddles.right -= speed;
			if (direction === "down") this.paddles.right += speed;
			this.paddles.right = Math.max(min, Math.min(max, this.paddles.right));
		}
	}


	public pause(): void {
		if (this.state === GameState.RUNNING) {
			this.state = GameState.PAUSE;
		}
	}

	public resume(): void {
		if (this.state === GameState.PAUSE) {
			this.state = GameState.RUNNING;
			this.countdown = Date.now() + this.config.gameStartCountdown;
		}
	}

	public reset(): void {
		this.ball.x = 50;
		this.ball.y = 50;
		this.paddles.left = 50;
		this.paddles.right = 50;
		this.ball.velocity = this.config.initialVelocity;

		// Randomize initial direction
		let direction: { x: number; y: number };
		do {
			const heading = Math.random() * 2 * Math.PI;
			direction = { x: Math.cos(heading), y: Math.sin(heading) };
		} while (Math.abs(direction.x) <= 0.7 || Math.abs(direction.x) >= 0.9);

		this.ball.dirX = direction.x;
		this.ball.dirY = direction.y;

		this.countdown = Date.now() + this.config.gameStartCountdown;
	}

	public press(side: "left" | "right", direction: MovePaddleAction): void {
		this.inputState[side][direction] = true;
	}
	public release(side: "left" | "right", direction: MovePaddleAction): void {
		this.inputState[side][direction] = false;
	}

	public isInCountdown(): boolean {
		return this.countdown !== null && Date.now() < this.countdown;
	}

	public update(delta: number): void {
		const now = Date.now();

		if (this.tickListeners.length > 0) {
			const state = this.getState();
			this.tickListeners.forEach(cb => cb(state, now));
		}

		if (this.state === GameState.FINISH) return;
		if (this.state === GameState.PAUSE) return;
		if (this.isInCountdown()) return;

		const step = this.config.paddleSpeed * this.config.movementSensitivity * (delta / 16);
		const min = this.config.paddleHeightPercentage / 2;
		const max = 100 - this.config.paddleHeightPercentage / 2;

		if (this.inputState.left.up && !this.inputState.left.down) {
			this.paddles.left -= step;
		} else if (this.inputState.left.down && !this.inputState.left.up) {
			this.paddles.left += step;
		}

		if (this.inputState.right.up && !this.inputState.right.down) {
			this.paddles.right -= step;
		} else if (this.inputState.right.down && !this.inputState.right.up) {
			this.paddles.right += step;
		}

		this.paddles.left = Math.max(min, Math.min(max, this.paddles.left));
		this.paddles.right = Math.max(min, Math.min(max, this.paddles.right));

		this.ball.x += this.ball.dirX * this.ball.velocity * delta;
		this.ball.y += this.ball.dirY * this.ball.velocity * delta;

		const newVelocity = this.ball.velocity + this.config.velocityIncrease * delta;
		if (newVelocity <= this.config.maxVelocity) {
			this.ball.velocity = newVelocity;
		}

		this.handleWallCollision();
		this.handlePaddleCollision();

		this.checkGoal();

	}

	private handleWallCollision(): void {
		const ballRadius = 1.5;
		// Top wall
		if (this.ball.y <= ballRadius && this.ball.dirY < 0) {
			this.ball.dirY = Math.abs(this.ball.dirY);
			this.ball.y = ballRadius + 0.5;
		}
		// Bottom wall
		if (this.ball.y >= 100 - ballRadius && this.ball.dirY > 0) {
			this.ball.dirY = -Math.abs(this.ball.dirY);
			this.ball.y = 100 - ballRadius - 0.5;
		}
	}

	private handlePaddleCollision(): void {
		const ballRadius = BALL_RADIUS;
		const paddleHeight = this.config.paddleHeightPercentage;
		const paddleWidth = this.config.paddleWidthPercentage;

		if (this.ball.dirX < 0) {
			const leftPaddleX = 0;
			const rightPaddleX = leftPaddleX + paddleWidth;

			if (this.ball.x >= leftPaddleX && this.ball.x <= rightPaddleX) {
				const paddleTop = this.paddles.left - paddleHeight / 2;
				const paddleBottom = this.paddles.left + paddleHeight / 2;

				if (this.ball.y >= paddleTop - ballRadius && this.ball.y <= paddleBottom + ballRadius) {
					this.#processPaddleCollision('left', leftPaddleX, rightPaddleX, paddleHeight);
				}
			}
		}

		if (this.ball.dirX > 0) {
			const rightPaddleX = 100;
			const leftPaddleX = rightPaddleX - paddleWidth;

			if (this.ball.x >= leftPaddleX && this.ball.x <= rightPaddleX) {
				const paddleTop = this.paddles.right - paddleHeight / 2;
				const paddleBottom = this.paddles.right + paddleHeight / 2;

				if (this.ball.y >= paddleTop - ballRadius && this.ball.y <= paddleBottom + ballRadius) {
					this.#processPaddleCollision('right', leftPaddleX, rightPaddleX, paddleHeight);
				}
			}
		}
	}

	#processPaddleCollision(side: 'left' | 'right', paddleLeftX: number, paddleRightX: number, paddleHeight: number): void {
		const paddleCenter = side === 'left' ? this.paddles.left : this.paddles.right;
		const paddleHalfHeight = paddleHeight / 2;

		const relativeY = (this.ball.y - paddleCenter) / paddleHalfHeight;
		const clampedRelativeY = Math.max(-1, Math.min(1, relativeY));

		const angle = this.#calculateBounceAngle(clampedRelativeY);

		const currentSpeed = Math.sqrt(this.ball.dirX ** 2 + this.ball.dirY ** 2);

		if (side === 'left') {
			this.ball.dirX = Math.abs(Math.cos(angle)) * currentSpeed;
		} else {
			this.ball.dirX = -Math.abs(Math.cos(angle)) * currentSpeed;
		}
		this.ball.dirY = Math.sin(angle) * currentSpeed;

		if (side === 'left') {
			this.ball.x = paddleRightX + (BALL_RADIUS / 2);
		} else {
			this.ball.x = paddleLeftX - (BALL_RADIUS / 2);
		}
	}

	#calculateBounceAngle(relativeY: number): number {
		const distanceFromCenter = Math.abs(relativeY);

		let maxAngle: number;
		if (distanceFromCenter > 0.95) {
			maxAngle = Math.PI / 4; // 45 degrees
		} else if (distanceFromCenter > 0.8) {
			maxAngle = Math.PI / 5; // 36 degrees
		} else if (distanceFromCenter > 0.5) {
			maxAngle = Math.PI / 6; // 30 degrees
		} else {
			maxAngle = Math.PI / 8; // 22.5 degrees
		}

		return Math.max(-maxAngle, Math.min(maxAngle, relativeY * maxAngle));
	}

	private checkGoal(): void {
		if (this.ball.x < 0) {
			this.scores.right++;
			this.scoreListeners.forEach(cb => cb({ ...this.scores }));

			if (this.config.maxScore && this.scores.right >= this.config.maxScore) {
				console.log(`🎯 Game finished! Right player won with score: ${this.scores.right}-${this.scores.left}`);
				this.state = GameState.FINISH;
				this.stopLoopIfNeeded();
				const now = Date.now();
				if (this.tickListeners.length > 0) {
					const state = this.getState();
					this.tickListeners.forEach(cb => cb(state, now));
				}
			} else {
				this.reset();
			}
		} else if (this.ball.x > 100) {
			this.scores.left++;
			this.scoreListeners.forEach(cb => cb({ ...this.scores }));

			if (this.config.maxScore && this.scores.left >= this.config.maxScore) {
				console.log(`🎯 Game finished! Left player won with score: ${this.scores.left}-${this.scores.right}`);
				this.state = GameState.FINISH;
				this.stopLoopIfNeeded();
				const now = Date.now();
				if (this.tickListeners.length > 0) {
					const state = this.getState();
					this.tickListeners.forEach(cb => cb(state, now));
				}
			} else {
				this.reset();
			}
		}
	}

	public getState(): GameStatus {
		return {
			debug: this.config.debug,
			ball: { ...this.ball },
			paddles: { ...this.paddles },
			scores: { ...this.scores },
			state: this.state,
			gameScoreGoal: this.config.maxScore,
			countdownEndsAt: this.countdown,
			leftPlayer: this.leftPlayer,
			rightPlayer: this.rightPlayer,
		};
	}

	public get leftPlayer(): GameUserInfo | null {
		return this._leftPlayer ?? { id: '1', username: 'Leo' };
	}
	public get rightPlayer(): GameUserInfo | null {
		return this._rightPlayer ?? { id: '2', username: 'Pasquale' };
	}


	#loopAnimationInterval: NodeJS.Timeout | null = null;
	#loopAnimationFrameId: number | null = null;
	private startLoop() {
		this.lastTick = Date.now();
		if (this.config.shouldUseRequestAnimationFrame) {
			this.#loopAnimationFrameId = requestAnimationFrame(() => this.#loop());
		} else {
			if (this.#loopAnimationInterval) {
				clearInterval(this.#loopAnimationInterval);
			}
			this.#loopAnimationInterval = setInterval(() => this.#loop(), FRAME_TIME_MS);
		}
	}
	#loop() {
		const now = Date.now();
		const delta = Math.max(0, now - (this.lastTick ?? now));
		this.lastTick = now;
		this.update(delta);
		if (this.config.shouldUseRequestAnimationFrame) {
			this.#loopAnimationFrameId = requestAnimationFrame(() => this.#loop());
		}
	}

	private stopLoop() {
		if (this.#loopAnimationFrameId) {
			cancelAnimationFrame(this.#loopAnimationFrameId);
			this.#loopAnimationFrameId = null;
		}
		if (this.#loopAnimationInterval) {
			if (this.#loopAnimationInterval) {
				clearInterval(this.#loopAnimationInterval);
			}
			this.#loopAnimationInterval = null;
		}
	}
	private stopLoopIfNeeded() {
		if (this.state === GameState.FINISH) {
			this.stopLoop();
		}
	}

	public onTick(callback: (state: GameStatus, now: number) => void): () => void {
		this.tickListeners.push(callback);
		return () => {
			const index = this.tickListeners.indexOf(callback);
			if (index > -1) {
				this.tickListeners.splice(index, 1);
			}
		};
	}

	public onScore(callback: (scores: Scores) => void): () => void {
		this.scoreListeners.push(callback);
		return () => {
			const index = this.scoreListeners.indexOf(callback);
			if (index > -1) {
				this.scoreListeners.splice(index, 1);
			}
		};
	}
}


