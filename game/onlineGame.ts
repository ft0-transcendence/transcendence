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
        this.startLoop();
    }

    public onPlayerJoin(_player: GameUserInfo): void { }
    public onPlayerLeave(_playerId: GameUserInfo['id']): void { }
    public onStateRequested(): GameStatus { return this.getState(); }
    public onPlayerAction(playerId: GameUserInfo['id'], action: MovePaddleAction): void {
        this.movePlayerPaddle(playerId, action);
    }

    private startLoop() {
        const TICK_MS = 16; // ~60fps
        this.lastTick = Date.now();
        this.loopHandle = setInterval(async () => {
            const now = Date.now();
            const delta = Math.max(0, now - (this.lastTick ?? now));
            this.lastTick = now;

            this.update(delta);

            this.socketNamespace.to(this.gameId).emit("game-state", this.getState());

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
        this.socketNamespace.to(this.gameId).emit("game-finished", state);
        if (this.onFinish) {
            await this.onFinish(state);
        }
    }
}