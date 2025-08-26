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