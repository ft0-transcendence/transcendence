import { Game, GameUserInfo, GameStatus, MovePaddleAction } from "../backend/game";

export class OnlineGame extends Game {
    constructor(config?: Partial<ConstructorParameters<typeof Game>[0]>) {
        super(config);
    }

    // Hook: chiamabile quando un giocatore entra (per eventuali side effects)
    public onPlayerJoin(_player: GameUserInfo): void { }

    // Hook: chiamabile quando un giocatore esce
    public onPlayerLeave(_playerId: GameUserInfo['id']): void { }

    // Hook: richiesta stato (utile per broadcast)
    public onStateRequested(): GameStatus {
        return this.getState();
    }

    // Hook: azione giocatore (wrappa l’API base)
    public onPlayerAction(playerId: GameUserInfo['id'], action: MovePaddleAction): void {
        this.movePlayerPaddle(playerId, action);
    }
}