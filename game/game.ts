// backend/game/Game.ts

export enum GameState {
    TOSTART = "TOSTART",
    RUNNING = "RUNNING",
    PAUSE = "PAUSE",
    FINISH = "FINISH"
  }
  
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
  
  export class Game {
    static readonly INITIAL_VELOCITY = 0.05;
    static readonly VELOCITY_INCREASE = 0.000005;
    static readonly MAX_VELOCITY = 0.15;
    static readonly PADDLE_SPEED = 0.2;
    static readonly MOVEMENT_SENSITIVITY = 0.5;
    static readonly COUNTDOWN_TIME = 3000;
    static readonly MAX_SCORE = 10;
    static readonly BOARD_HEIGHT = 100;
    static readonly BOARD_WIDTH = 100;
    static readonly PADDLE_HEIGHT = 20; // percentuale
  
    public state: GameState;
    public countdown: number | null;
    public ball: Ball;
    public paddles: Paddles;
    public scores: Scores;
    public lastUpdate: number | null;
  
    constructor() {
      this.state = GameState.TOSTART;
      this.countdown = null;
  
      this.ball = {
        x: 50,
        y: 50,
        dirX: 0,
        dirY: 0,
        velocity: Game.INITIAL_VELOCITY,
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
        this.countdown = Date.now() + Game.COUNTDOWN_TIME;
      }
    }
  
    public reset(): void {
      this.ball.x = 50;
      this.ball.y = 50;
      this.paddles.left = 50;
      this.paddles.right = 50;
      this.ball.velocity = Game.INITIAL_VELOCITY;
  
      // Direzione random
      let direction: { x: number; y: number };
      do {
        const heading = Math.random() * 2 * Math.PI;
        direction = { x: Math.cos(heading), y: Math.sin(heading) };
      } while (Math.abs(direction.x) <= 0.7 || Math.abs(direction.x) >= 0.9);

  
      this.ball.dirX = direction.x;
      this.ball.dirY = direction.y;
  
      this.countdown = Date.now() + Game.COUNTDOWN_TIME;
    }
  
    public movePaddle(player: "left" | "right", direction: "up" | "down"): void {
      const speed = Game.PADDLE_SPEED * Game.MOVEMENT_SENSITIVITY;
      if (player === "left") {
        if (direction === "up") this.paddles.left -= speed;
        if (direction === "down") this.paddles.left += speed;
        this.paddles.left = Math.max(0, Math.min(100, this.paddles.left));
      } else if (player === "right") {
        if (direction === "up") this.paddles.right -= speed;
        if (direction === "down") this.paddles.right += speed;
        this.paddles.right = Math.max(0, Math.min(100, this.paddles.right));
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
      const newVelocity = this.ball.velocity + Game.VELOCITY_INCREASE * delta;
      if (newVelocity <= Game.MAX_VELOCITY) {
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
        Math.abs(this.ball.y - this.paddles.left) <= Game.PADDLE_HEIGHT / 2
      ) {
        this.ball.dirX = Math.abs(this.ball.dirX);
        // Cambia angolo in base a dove colpisce il paddle
        const relY = (this.ball.y - this.paddles.left) / (Game.PADDLE_HEIGHT / 2);
        const angle = relY * Math.PI / 4;
        const speed = Math.sqrt(this.ball.dirX ** 2 + this.ball.dirY ** 2);
        this.ball.dirX = Math.abs(Math.cos(angle)) * speed;
        this.ball.dirY = Math.sin(angle) * speed;
      }
      // Paddle destro
      if (
        this.ball.x >= 95 && // posizione paddle destro
        Math.abs(this.ball.y - this.paddles.right) <= Game.PADDLE_HEIGHT / 2
      ) {
        this.ball.dirX = -Math.abs(this.ball.dirX);
        const relY = (this.ball.y - this.paddles.right) / (Game.PADDLE_HEIGHT / 2);
        const angle = relY * Math.PI / 4;
        const speed = Math.sqrt(this.ball.dirX ** 2 + this.ball.dirY ** 2);
        this.ball.dirX = -Math.abs(Math.cos(angle)) * speed;
        this.ball.dirY = Math.sin(angle) * speed;
      }
    }
  
    private checkGoal(): void {
      if (this.ball.x < 0) {
        this.scores.right++;
        if (this.scores.right >= Game.MAX_SCORE) {
          this.state = GameState.FINISH;
        } else {
          this.reset();
        }
      } else if (this.ball.x > 100) {
        this.scores.left++;
        if (this.scores.left >= Game.MAX_SCORE) {
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