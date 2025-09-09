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

    // Online-only: player/session/connection management
    private _playerLeft: GameUserInfo | null = null;
    private _playerRight: GameUserInfo | null = null;
    private connectedUsers: GameUserInfo[] = [];
    private playerLeftReady = false;
    private playerRightReady = false;

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

    // Players assignment and readiness
    public setPlayers(player1: GameUserInfo, player2: GameUserInfo) {
        const randomPos = Math.random() > 0.5;
        this._playerLeft = randomPos ? player1 : player2;
        this._playerRight = randomPos ? player2 : player1;
    }

    public playerReady(player: GameUserInfo) {
        if (player.id === this._playerLeft?.id) {
            this.playerLeftReady = true;
        } else if (player.id === this._playerRight?.id) {
            this.playerRightReady = true;
        }
        if (this.playerLeftReady && this.playerRightReady) {
            this.start();
        }
    }

    public isPlayerInGame(id: GameUserInfo['id']) {
        return id === this._playerLeft?.id || id === this._playerRight?.id;
    }

    public movePlayerPaddle(playerId: GameUserInfo['id'], direction: MovePaddleAction) {
        if (playerId === this._playerLeft?.id) {
            this.movePaddle("left", direction);
        } else if (playerId === this._playerRight?.id) {
            this.movePaddle("right", direction);
        }
    }

    // Connected users management
    public addConnectedUser(user: GameUserInfo): void {
        const existingUserIndex = this.connectedUsers.findIndex(u => u.id === user.id);
        if (existingUserIndex >= 0) {
            this.connectedUsers[existingUserIndex] = user;
        } else {
            this.connectedUsers.push(user);
        }
    }

    public removeConnectedUser(user: GameUserInfo): boolean {
        const initialLength = this.connectedUsers.length;
        this.connectedUsers = this.connectedUsers.filter(u => u.id !== user.id);
        return this.connectedUsers.length < initialLength;
    }

    public getConnectedPlayers(): GameUserInfo[] {
        return [...this.connectedUsers];
    }

    // Override player getters
    public get leftPlayer(): GameUserInfo | null { return this._playerLeft; }
    public get rightPlayer(): GameUserInfo | null { return this._playerRight; }

    // Disconnection handling
    public markPlayerDisconnected(playerId: string) {
        const deadline = Date.now() + this.GRACE_MS;
        const hadNoDisconnections = this.disconnectedUntil.size === 0;
        this.disconnectedUntil.set(playerId, deadline);
        if (this.socketNamespace) {
            this.socketNamespace.to(this.gameId).emit("player-disconnected", {
                userId: playerId,
                expiresAt: deadline,
            });
        }
        // Pause the game while waiting for reconnection (grace period)
        if (hadNoDisconnections) {
            this.pause();
        }
    }

    public markPlayerReconnected(playerId: string) {
        if (!this.disconnectedUntil.has(playerId)) return;
        this.disconnectedUntil.delete(playerId);
        if (this.socketNamespace) {
            this.socketNamespace.to(this.gameId).emit("player-reconnected", {
                userId: playerId,
            });
        }
        // If everyone is back, resume with countdown
        if (this.disconnectedUntil.size === 0 && this.state !== GameState.FINISH) {
            this.resume();
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

            // Check grace period expirations → forfeit 10-0
            if (!this.finished && this.disconnectedUntil.size > 0) {
                for (const [playerId, until] of this.disconnectedUntil.entries()) {
                    if (now >= until) {
                        // Forfeit: opponent wins 10-0
                        const opponentId = this.getOpponentPlayerId(playerId);
                        if (opponentId) {
                            const FORFEIT_SCORE = 10;
                            if (this.leftPlayer && this.rightPlayer) {
                                if (opponentId === this.leftPlayer.id) {
                                    this.scores.left = FORFEIT_SCORE;
                                } else if (opponentId === this.rightPlayer.id) {
                                    this.scores.right = FORFEIT_SCORE;
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