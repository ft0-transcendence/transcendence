import { Game, GameUserInfo, GameStatus, MovePaddleAction } from "./game";
import { GameState } from "./game";

type FinishCallback = (state: GameStatus) => Promise<void> | void;

export class OnlineGame extends Game {
    private gameId: string;
    private socketNamespace: any;

    private loopHandle: ReturnType<typeof setInterval> | null = null;
    private lastTick: number | null = null;
    private finished = false;
    private onFinish?: FinishCallback;

    // Grace period management
    private readonly GRACE_MS = 30000; // 30s
    private disconnectedUntil: Map<string, number> = new Map();

    constructor(
        gameId: string,
        socketNamespace: any,
        config?: Partial<ConstructorParameters<typeof Game>[0]>,
        onFinish?: FinishCallback,
    ) {
        super(config);
        this.gameId = gameId;
        this.socketNamespace = socketNamespace;
        this.onFinish = onFinish;
        if (socketNamespace) {
            this.startLoop();
        }
    }

    public onPlayerJoin(_player: GameUserInfo): void { }
    public onPlayerLeave(_playerId: GameUserInfo['id']): void { }
    public onStateRequested(): GameStatus { return this.getState(); }
    public onPlayerAction(playerId: GameUserInfo['id'], action: MovePaddleAction): void {
        this.movePlayerPaddle(playerId, action);
    }

    public setSocketNamespace(socketNamespace: any): void {
        this.socketNamespace = socketNamespace;
        if (!this.loopHandle && !this.finished) {
            this.startLoop();
        }
    }

    // Disconnection handling
    public markPlayerDisconnected(playerId: string) {
        const deadline = Date.now() + this.GRACE_MS;
        this.disconnectedUntil.set(playerId, deadline);
        if (this.socketNamespace) {
            this.socketNamespace.to(this.gameId).emit("player-disconnected", {
                userId: playerId,
                expiresAt: deadline,
            });
        }
    }

    public markPlayerReconnected(playerId: string) {
        if (this.disconnectedUntil.has(playerId)) {
            this.disconnectedUntil.delete(playerId);
            if (this.socketNamespace) {
                this.socketNamespace.to(this.gameId).emit("player-reconnected", {
                    userId: playerId,
                });
            }
        }
    }

    private getOpponentPlayerId(playerId: string): string | null {
        const left = this.leftPlayer?.id;
        const right = this.rightPlayer?.id;
        if (left === playerId) return right ?? null;
        if (right === playerId) return left ?? null;
        return null;
    }

    private startLoop() {
        const TICK_MS = 16; // ~60fps
        this.lastTick = Date.now();
        this.loopHandle = setInterval(async () => {
            const now = Date.now();
            const delta = Math.max(0, now - (this.lastTick ?? now));
            this.lastTick = now;

            this.update(delta);

            // Check grace period expirations → forfeit
            if (!this.finished && this.disconnectedUntil.size > 0) {
                for (const [playerId, until] of this.disconnectedUntil.entries()) {
                    if (now >= until) {
                        // Forfeit: opponent wins
                        const opponentId = this.getOpponentPlayerId(playerId);
                        if (opponentId) {
                            const max = this.currentConfig.maxScore ?? undefined;
                            if (max && this.leftPlayer && this.rightPlayer) {
                                if (opponentId === this.leftPlayer.id) {
                                    this.scores.left = max;
                                } else if (opponentId === this.rightPlayer.id) {
                                    this.scores.right = max;
                                }
                            }
                        }
                        this.disconnectedUntil.delete(playerId);
                        this.state = GameState.FINISH;
                        // Emit a final state immediately
                        if (this.socketNamespace) {
                            this.socketNamespace.to(this.gameId).emit("game-state", this.getState());
                        }
                        await this.finish();
                        break;
                    }
                }
            }

            if (this.socketNamespace) {
                this.socketNamespace.to(this.gameId).emit("game-state", this.getState());
            }

            if (this.state === GameState.FINISH) {
                await this.finish();
            }
        }, TICK_MS);
    }

    private stopLoop() {
        if (this.loopHandle) {
            clearInterval(this.loopHandle);
            this.loopHandle = null;
        }
    }

    public async finish() {
        if (this.finished) return;
        this.finished = true;
        this.stopLoop();
        const state = this.getState();
        if (this.socketNamespace) {
            this.socketNamespace.to(this.gameId).emit("game-finished", state);
        }
        if (this.onFinish) {
            await this.onFinish(state);
        }
    }
}