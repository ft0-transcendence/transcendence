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

    gameStartCountdown: number;
    maxScore?: number;

    initialVelocity: number;
    velocityIncrease: number;
    maxVelocity: number;

    paddleSpeed: number;
    movementSensitivity: number;

    paddleHeightPercentage: number;

    enableInternalLoop?: boolean;
}

export type GameUserInfo = {
    id: string;
    username: string;
    isPlayer?: boolean;
}

export class Game {
    #config: GameConfig = {
        debug: true,
        gameStartCountdown: 3000,

        initialVelocity: 0.035,
        velocityIncrease: 0.000003,
        maxVelocity: 0.12,
        paddleSpeed: 2.0,
        movementSensitivity: 1.0,
        maxScore: 10,

        paddleHeightPercentage: 20,
        enableInternalLoop: true,
    }


    get currentConfig() {
        return this.#config;
    }

    private inputState = {
        left: { up: false, down: false },
        right: { up: false, down: false },
    };

    // Internal loop management
    private loopHandle: ReturnType<typeof setInterval> | null = null;
    private lastTick: number | null = null;

    public state: GameState;
    public countdown: number | null;
    public ball: Ball;
    public paddles: Paddles;
    public scores: Scores;
    public lastUpdate: number | null;

    // Tick listeners to notify external systems (e.g., OnlineGame) after each update
    private tickListeners: Array<(state: GameStatus, now: number) => void> = [];

    // Local-only: store players for local games
    private _leftPlayer: GameUserInfo | null = null;
    private _rightPlayer: GameUserInfo | null = null;

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

    public start(): void {
        if (this.state === GameState.TOSTART || this.state === GameState.FINISH) {
            this.state = GameState.RUNNING;
            this.reset();
            if (!this.loopHandle) {
                this.startLoop();
            }
        }
    }

    public setPlayers(player1: GameUserInfo, player2: GameUserInfo): void {
        this._leftPlayer = player1;
        this._rightPlayer = player2;
    }
    public playerReady(_player: GameUserInfo): void {
        // TODO: aggiungere logica per startare il gioco quando entrambi i giocatori sono pronti
        if (this.state === GameState.TOSTART) {
            this.start();
        }
    }
    public isPlayerInGame(_id: GameUserInfo['id']): boolean { return false; }

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

        // Always notify listeners every tick (even during countdown/pause/finish)
        if (this.tickListeners.length > 0) {
            const state = this.getState();
            for (const cb of this.tickListeners) cb(state, now);
        }

        if (this.state === GameState.FINISH) return;
        if (this.state === GameState.PAUSE) return;
        if (this.isInCountdown()) return;

        // Move paddles based on input state
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

        // Move ball
        this.ball.x += this.ball.dirX * this.ball.velocity * delta;
        this.ball.y += this.ball.dirY * this.ball.velocity * delta;

        // Increase velocity
        const newVelocity = this.ball.velocity + this.#config.velocityIncrease * delta;
        if (newVelocity <= this.#config.maxVelocity) {
            this.ball.velocity = newVelocity;
        }

        // Collisions
        this.handleWallCollision();
        this.handlePaddleCollision();

        // Goals
        this.checkGoal();

        // (Listeners already notified at tick start)
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
        // Left paddle
        if (
            this.ball.x <= 5 &&
            Math.abs(this.ball.y - this.paddles.left) <= this.#config.paddleHeightPercentage / 2
        ) {
            this.ball.dirX = Math.abs(this.ball.dirX);
            const relY = (this.ball.y - this.paddles.left) / (this.#config.paddleHeightPercentage / 2);
            const angle = relY * Math.PI / 4;
            const speed = Math.sqrt(this.ball.dirX ** 2 + this.ball.dirY ** 2);
            this.ball.dirX = Math.abs(Math.cos(angle)) * speed;
            this.ball.dirY = Math.sin(angle) * speed;
        }
        // Right paddle
        if (
            this.ball.x >= 95 &&
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

    private startLoop() {
        const TICK_MS = 16; // ~60fps
        this.lastTick = Date.now();
        this.loopHandle = setInterval(() => {
            const now = Date.now();
            const delta = Math.max(0, now - (this.lastTick ?? now));
            this.lastTick = now;
            this.update(delta);
        }, TICK_MS);
    }
    private stopLoop() {
        if (this.loopHandle) {
            clearInterval(this.loopHandle);
            this.loopHandle = null;
        }
    }
    private stopLoopIfNeeded() { /* no-op: keep loop running */ }

    public onTick(callback: (state: GameStatus, now: number) => void): () => void {
        this.tickListeners.push(callback);
        return () => {
            this.tickListeners = this.tickListeners.filter(cb => cb !== callback);
        };
    }
}


