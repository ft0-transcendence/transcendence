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

	// Timestamp in ms when countdown ends (for 3-2-1 START). Null if not counting.
	countdownEndsAt: number | null;

	leftPlayer: GameUserInfo | null;
	rightPlayer: GameUserInfo | null;
}

export type GameConfig = {
	debug: boolean;

	shouldUseRequestAnimationFrame?: boolean;

	gameStartCountdown: number;
	maxScore?: number;

	initialVelocity: number;
	velocityIncrease: number;
	maxVelocity: number;

	paddleSpeed: number;
	movementSensitivity: number;

	paddleHeightPercentage: number;
}

export type GameUserInfo = {
	id: string;
	username: string;
	isPlayer?: boolean;
}

const BALL_RADIUS = 1.5;
const COLLISION_OFFSET = 0.5;
const TARGET_FPS = 60;
const FRAME_TIME_MS = 1000 / TARGET_FPS;

export const STANDARD_GAME_CONFIG: GameConfig = {
	debug: false,
	shouldUseRequestAnimationFrame: false,
	gameStartCountdown: 3000,
	maxScore: 7,
	initialVelocity: 0.05,
	velocityIncrease: 0.000005,
	maxVelocity: 0.16,
	paddleSpeed: 3,
	movementSensitivity: 0.5,
	paddleHeightPercentage: 20,
};

export class Game {
	#config: GameConfig;


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

	// Tick listeners to notify external systems (e.g., OnlineGame) after each update
	private tickListeners: Array<(state: GameStatus, now: number) => void> = [];

	// Local-only: store players for local games
	private _leftPlayer: GameUserInfo | null = null;
	private _rightPlayer: GameUserInfo | null = null;
	private leftPlayerReady: boolean = false;
	private rightPlayerReady: boolean = false;

	constructor(config: Partial<GameConfig> = {}) {
		this.#config = {
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
			velocity: this.#config.initialVelocity,
		};

		this.paddles = {
			left: 50,
			right: 50,
		};

		this.scores = {
			left: 0,
			right: 0,
		};
		if (config.maxScore && config.maxScore <= 0) {
			this.#config.maxScore = undefined;
		} else if (config.maxScore === undefined) {
			this.#config.maxScore = undefined;
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

		const speed = this.#config.paddleSpeed * this.#config.movementSensitivity;
		const min = this.#config.paddleHeightPercentage / 2;
		const max = 100 - this.#config.paddleHeightPercentage / 2;

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
			this.countdown = Date.now() + this.#config.gameStartCountdown;
		}
	}

	public reset(): void {
		this.ball.x = 50;
		this.ball.y = 50;
		this.paddles.left = 50;
		this.paddles.right = 50;
		this.ball.velocity = this.#config.initialVelocity;

		// Randomize initial direction
		let direction: { x: number; y: number };
		do {
			const heading = Math.random() * 2 * Math.PI;
			direction = { x: Math.cos(heading), y: Math.sin(heading) };
		} while (Math.abs(direction.x) <= 0.7 || Math.abs(direction.x) >= 0.9);

		this.ball.dirX = direction.x;
		this.ball.dirY = direction.y;

		this.countdown = Date.now() + this.#config.gameStartCountdown;
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

		const step = this.#config.paddleSpeed * this.#config.movementSensitivity * (delta / 16);
		const min = this.#config.paddleHeightPercentage / 2;
		const max = 100 - this.#config.paddleHeightPercentage / 2;

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

		const newVelocity = this.ball.velocity + this.#config.velocityIncrease * delta;
		if (newVelocity <= this.#config.maxVelocity) {
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
		const paddleHeight = this.#config.paddleHeightPercentage;
		const paddleWidth = 2; // Larghezza del paddle in percentuale
		const collisionMargin = 0.3; // Margine per collisioni più precise

		// Left paddle collision - solo sulla faccia frontale
		if (this.ball.dirX < 0 && this.ball.x <= 5 + paddleWidth && this.ball.x >= 5) {
			const paddleTop = this.paddles.left - paddleHeight / 2;
			const paddleBottom = this.paddles.left + paddleHeight / 2;

			// Controlla se la pallina è nella zona di collisione del paddle (solo sulla faccia frontale)
			if (this.ball.y >= paddleTop - ballRadius && this.ball.y <= paddleBottom + ballRadius) {
				// Calcola la posizione relativa della pallina rispetto al centro del paddle
				const relativeY = (this.ball.y - this.paddles.left) / (paddleHeight / 2);

				// Gestione sofisticata degli angoli basata sulla posizione del colpo
				let angle: number;

				// Calcola la distanza dal centro (0 = centro, 1 = bordo)
				const distanceFromCenter = Math.abs(relativeY);

				if (distanceFromCenter > 0.95) {
					// Colpo sui bordi estremi - angolo elevato ma non troppo verticale
					const maxAngle = Math.PI / 2.5; // ~72 gradi massimo
					angle = Math.max(-maxAngle, Math.min(maxAngle, relativeY * maxAngle));
				} else if (distanceFromCenter > 0.8) {
					// Colpo sui bordi - angolo elevato
					const maxAngle = Math.PI / 2.8; // ~64 gradi
					angle = Math.max(-maxAngle, Math.min(maxAngle, relativeY * maxAngle));
				} else if (distanceFromCenter > 0.5) {
					// Colpo nella zona intermedia - angolo medio
					const maxAngle = Math.PI / 3.5; // ~51 gradi
					angle = Math.max(-maxAngle, Math.min(maxAngle, relativeY * maxAngle));
				} else {
					// Colpo nel centro - angolo controllato
					const maxAngle = Math.PI / 4; // 45 gradi massimo
					angle = Math.max(-maxAngle, Math.min(maxAngle, relativeY * maxAngle));
				}

				// Calcola la velocità mantenendo l'energia
				const speed = Math.sqrt(this.ball.dirX ** 2 + this.ball.dirY ** 2);
				const minSpeed = this.#config.initialVelocity * 0.8; // Velocità minima
				const finalSpeed = Math.max(speed, minSpeed);

				// Applica l'angolo e la velocità
				this.ball.dirX = Math.abs(Math.cos(angle)) * finalSpeed;
				this.ball.dirY = Math.sin(angle) * finalSpeed;

				// Assicura che la pallina non rimanga bloccata nel paddle
				this.ball.x = 5 + paddleWidth + 0.5;
			}
		}

		// Right paddle collision - solo sulla faccia frontale
		if (this.ball.dirX > 0 && this.ball.x >= 95 - paddleWidth && this.ball.x <= 95) {
			const paddleTop = this.paddles.right - paddleHeight / 2;
			const paddleBottom = this.paddles.right + paddleHeight / 2;

			// Controlla se la pallina è nella zona di collisione del paddle (solo sulla faccia frontale)
			if (this.ball.y >= paddleTop - ballRadius && this.ball.y <= paddleBottom + ballRadius) {
				// Calcola la posizione relativa della pallina rispetto al centro del paddle
				const relativeY = (this.ball.y - this.paddles.right) / (paddleHeight / 2);

				// Gestione sofisticata degli angoli basata sulla posizione del colpo
				let angle: number;

				// Calcola la distanza dal centro (0 = centro, 1 = bordo)
				const distanceFromCenter = Math.abs(relativeY);

				if (distanceFromCenter > 0.95) {
					// Colpo sui bordi estremi - angolo elevato ma non troppo verticale
					const maxAngle = Math.PI / 2.5; // ~72 gradi massimo
					angle = Math.max(-maxAngle, Math.min(maxAngle, relativeY * maxAngle));
				} else if (distanceFromCenter > 0.8) {
					// Colpo sui bordi - angolo elevato
					const maxAngle = Math.PI / 2.8; // ~64 gradi
					angle = Math.max(-maxAngle, Math.min(maxAngle, relativeY * maxAngle));
				} else if (distanceFromCenter > 0.5) {
					// Colpo nella zona intermedia - angolo medio
					const maxAngle = Math.PI / 3.5; // ~51 gradi
					angle = Math.max(-maxAngle, Math.min(maxAngle, relativeY * maxAngle));
				} else {
					// Colpo nel centro - angolo controllato
					const maxAngle = Math.PI / 4; // 45 gradi massimo
					angle = Math.max(-maxAngle, Math.min(maxAngle, relativeY * maxAngle));
				}

				// Calcola la velocità mantenendo l'energia
				const speed = Math.sqrt(this.ball.dirX ** 2 + this.ball.dirY ** 2);
				const minSpeed = this.#config.initialVelocity * 0.8; // Velocità minima
				const finalSpeed = Math.max(speed, minSpeed);

				// Applica l'angolo e la velocità
				this.ball.dirX = -Math.abs(Math.cos(angle)) * finalSpeed;
				this.ball.dirY = Math.sin(angle) * finalSpeed;

				// Assicura che la pallina non rimanga bloccata nel paddle
				this.ball.x = 95 - paddleWidth - 0.5;
			}
		}
	}

	private checkGoal(): void {
		if (this.ball.x < 0) {
			this.scores.right++;
			if (this.#config.maxScore && this.scores.right >= this.#config.maxScore) {
				this.state = GameState.FINISH;
				this.stopLoopIfNeeded();
			} else {
				this.reset();
			}
		} else if (this.ball.x > 100) {
			this.scores.left++;
			if (this.#config.maxScore && this.scores.left >= this.#config.maxScore) {
				this.state = GameState.FINISH;
				this.stopLoopIfNeeded();
			} else {
				this.reset();
			}
		}
	}

	public getState(): GameStatus {
		return {
			debug: this.#config.debug,
			ball: { ...this.ball },
			paddles: { ...this.paddles },
			scores: { ...this.scores },
			state: this.state,
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
		if (this.#config.shouldUseRequestAnimationFrame) {
			this.#loopAnimationFrameId = requestAnimationFrame(() => this.#loop());
		} else {
			if (this.#loopAnimationInterval) {
				clearInterval(this.#loopAnimationInterval);
			}
			this.#loopAnimationInterval = setInterval(() => this.#loop(), 1000 / 60);
		}
	}
	#loop() {
		const now = Date.now();
		const delta = Math.max(0, now - (this.lastTick ?? now));
		this.lastTick = now;
		this.update(delta);
		if (this.#config.shouldUseRequestAnimationFrame) {
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
}


