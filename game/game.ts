// backend/game/Game.ts

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
	ball: Ball;
	paddles: Paddles;
	scores: Scores;
	state: GameState;
}

export type GameConfig = {
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
}

export class Game {
	#config: GameConfig = {
		gameStartCountdown: 3000,

		initialVelocity: 0.05,
		velocityIncrease: 0.000005,
		maxVelocity: 0.15,
		paddleSpeed: 0.2,
		movementSensitivity: 0.5,
		maxScore: 1,

		paddleHeightPercentage: 20,
	}

	#playerLeft: GameUserInfo | null = null;
	#playerRight: GameUserInfo | null = null;


	#playerLeftReady = false;
	#playerRightReady = false;

	#bothPlayersReady = () => this.#playerLeftReady && this.#playerRightReady;

	get currentConfig() {
		return this.#config;
	}


	public state: GameState;
	public countdown: number | null;
	public ball: Ball;
	public paddles: Paddles;
	public scores: Scores;
	public lastUpdate: number | null;

	constructor(config?: Partial<GameConfig>) {
		if (config) {
			this.updatePartialConfig(config);
		}

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

		this.lastUpdate = null;
	}

	public setPlayers(player1: GameUserInfo, player2: GameUserInfo) {
		const randomPos = Math.random() > .5;
		this.#playerLeft = randomPos ? player1 : player2;
		this.#playerRight = randomPos ? player2 : player1;
	}

	public playerReady(player: GameUserInfo) {
		if (player.id === this.#playerLeft?.id) {
			this.#playerLeftReady = true;
		} else if (player.id === this.#playerRight?.id) {
			this.#playerRightReady = true;
		}
		if (this.#bothPlayersReady()) {
			this.start();
		}
	}

	public isPlayerInGame(id: GameUserInfo['id']) {
		return id === this.#playerLeft?.id || id === this.#playerRight?.id;
	}

	public movePlayerPaddle(playerId: GameUserInfo['id'], direction: MovePaddleAction) {
		if (playerId === this.#playerLeft?.id) {
			this.movePaddle("left", direction);
		} else if (playerId === this.#playerRight?.id) {
			this.movePaddle("right", direction);
		}
	}

	public start(): void {
		if (this.state === GameState.TOSTART || this.state === GameState.FINISH) {
			this.state = GameState.RUNNING;
			this.reset();
		}
	}
	public updatePartialConfig(config: Partial<GameConfig>) {
		Object.assign(this.#config, config as Partial<GameConfig>);
		if (config.maxScore && config.maxScore <= 0) {
			this.#config.maxScore = undefined;
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

		// Direzione random
		let direction: { x: number; y: number };
		do {
			const heading = Math.random() * 2 * Math.PI;
			direction = { x: Math.cos(heading), y: Math.sin(heading) };
		} while (Math.abs(direction.x) <= 0.7 || Math.abs(direction.x) >= 0.9);


		this.ball.dirX = direction.x;
		this.ball.dirY = direction.y;

		this.countdown = Date.now() + this.#config.gameStartCountdown;
	}

	public movePaddle(player: "left" | "right", direction: MovePaddleAction): void {
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

	public isInCountdown(): boolean {
		return this.countdown !== null && Date.now() < this.countdown;
	}

	public update(delta: number): void {
		if (this.state === GameState.FINISH) return;
		if (this.state === GameState.PAUSE) return;
		if (this.isInCountdown()) return;

		// Muovi la pallina
		this.ball.x += this.ball.dirX * this.ball.velocity * delta;
		this.ball.y += this.ball.dirY * this.ball.velocity * delta;

		// Aumenta velocità
		const newVelocity = this.ball.velocity + this.#config.velocityIncrease * delta;
		if (newVelocity <= this.#config.maxVelocity) {
			this.ball.velocity = newVelocity;
		}

		// Collisione con muri
		this.handleWallCollision();

		// Collisione con paddle
		this.handlePaddleCollision();

		// Goal
		this.checkGoal();
	}

	private handleWallCollision(): void {
		const ballRadius = 1.5;
		// Bordo superiore
		if (this.ball.y <= ballRadius && this.ball.dirY < 0) {
			this.ball.dirY = Math.abs(this.ball.dirY);
			this.ball.y = ballRadius + 0.5;
		}
		// Bordo inferiore
		if (this.ball.y >= 100 - ballRadius && this.ball.dirY > 0) {
			this.ball.dirY = -Math.abs(this.ball.dirY);
			this.ball.y = 100 - ballRadius - 0.5;
		}
	}

	private handlePaddleCollision(): void {
		// Paddle sinistro
		if (
			this.ball.x <= 5 && // posizione paddle sinistro
			Math.abs(this.ball.y - this.paddles.left) <= this.#config.paddleHeightPercentage / 2
		) {
			this.ball.dirX = Math.abs(this.ball.dirX);
			// Cambia angolo in base a dove colpisce il paddle
			const relY = (this.ball.y - this.paddles.left) / (this.#config.paddleHeightPercentage / 2);
			const angle = relY * Math.PI / 4;
			const speed = Math.sqrt(this.ball.dirX ** 2 + this.ball.dirY ** 2);
			this.ball.dirX = Math.abs(Math.cos(angle)) * speed;
			this.ball.dirY = Math.sin(angle) * speed;
		}
		// Paddle destro
		if (
			this.ball.x >= 95 && // posizione paddle destro
			Math.abs(this.ball.y - this.paddles.right) <= this.#config.paddleHeightPercentage / 2
		) {
			this.ball.dirX = -Math.abs(this.ball.dirX);
			const relY = (this.ball.y - this.paddles.right) / (this.#config.paddleHeightPercentage / 2);
			const angle = relY * Math.PI / 4;
			const speed = Math.sqrt(this.ball.dirX ** 2 + this.ball.dirY ** 2);
			this.ball.dirX = -Math.abs(Math.cos(angle)) * speed;
			this.ball.dirY = Math.sin(angle) * speed;
		}
	}

	private checkGoal(): void {
		if (this.ball.x < 0) {
			this.scores.right++;
			if (this.#config.maxScore && this.scores.right >= this.#config.maxScore) {
				this.state = GameState.FINISH;
			} else {
				this.reset();
			}
		} else if (this.ball.x > 100) {
			this.scores.left++;
			if (this.#config.maxScore && this.scores.left >= this.#config.maxScore) {
				this.state = GameState.FINISH;
			} else {
				this.reset();
			}
		}
	}

	public getState(): GameStatus {
		return {
			ball: { ...this.ball },
			paddles: { ...this.paddles },
			scores: { ...this.scores },
			state: this.state,
		};
	}
}
