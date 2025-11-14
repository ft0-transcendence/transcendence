import { OnlineGame } from "./onlineGame";
import { GameUserInfo, GameStatus } from "./game";
import { db } from "../src/trpc/db";
import { updateTournamentWinnerStats, updateGameStats } from "../src/utils/statsUtils";

type TournamentGameFinishCallback = (state: GameStatus, tournamentId: string, gameId: string) => Promise<void>;

export class TournamentGame extends OnlineGame {
    public readonly tournamentId: string;
    private onTournamentFinish?: TournamentGameFinishCallback;

    constructor(
        gameId: string,
        tournamentId: string,
        socketNamespace: any,
        config?: any,
        onTournamentFinish?: TournamentGameFinishCallback,
        updateGameActivity?: () => Promise<void>,
    ) {
        super(gameId, socketNamespace, config, async (state) => {
            // Handle tournament advancement when game finishes (quello che faceva getMatchresults)
            // Always advance tournament, but handle statistics differently for forfeited games
            await this.handleTournamentAdvancement();
        }, updateGameActivity);
        this.tournamentId = tournamentId;
        this.onTournamentFinish = onTournamentFinish;
    }

    public async finish() {
        if (this.finished) return;
        this.finished = true;

        console.log(`Tournament Game ${this.gameId} finishing with scores: ${this.scores.left}-${this.scores.right}`);

        for (const [playerId, interval] of this.warningIntervals) {
            clearInterval(interval);
        }
        this.warningIntervals.clear();

        if (this.unsubscribeTick) {
            this.unsubscribeTick();
            this.unsubscribeTick = null;
        }

        const state = this.getState();
        if (this.socketNamespace) {
            this.socketNamespace.to(this.gameId).emit("game-finished", state);
        }

        // Gestione avanzamento torneo
        if (this.onTournamentFinish) {
            try {
                console.log(`Tournament Game ${this.gameId} calling onTournamentFinish callback`);
                await this.onTournamentFinish(state, this.tournamentId, this.gameId);
                console.log(`Tournament Game ${this.gameId} onTournamentFinish callback completed`);
            } catch (error) {
                console.error(`Tournament Game ${this.gameId} onTournamentFinish callback failed:`, error);
            }
        }
    }

    public async handleTournamentAdvancement() {
        try {
            const winnerId = this.scores.left > this.scores.right ? this.leftPlayer?.id : this.rightPlayer?.id;
            const loserId = this.scores.left > this.scores.right ? this.rightPlayer?.id : this.leftPlayer?.id;
            
            if (!winnerId || !loserId) {
                console.error(`Tournament Game ${this.gameId}: No winner/loser determined`);
                return;
            }

            // Aggiorna sempre le statistiche dei giocatori (anche in caso di forfeit)
            if (this.scores.left !== this.scores.right) {
                console.log(`📊 Tournament Game ${this.gameId}: Updating stats - winner=${winnerId}, loser=${loserId}, forfeited=${this.wasForfeited}`);
                await updateGameStats(db, winnerId, loserId);
            } else {
                console.log(`⚠️ Tournament Game ${this.gameId} ended in a tie, skipping stats update`);
            }

            // Trova partita successiva
            const currentGame = await db.game.findUnique({
                where: { id: this.gameId },
                include: { previousGames: { select: { id: true } } }
            });

            if (currentGame?.nextGameId) {
                // Determina lo slot nella partita successiva
                const nextGame = await db.game.findUnique({
                    where: { id: currentGame.nextGameId },
                    include: { previousGames: { select: { id: true } } }
                });

                if (nextGame && nextGame.previousGames.length === 2) {
                    const childIds = nextGame.previousGames.map(g => g.id).sort();
                    const isLeft = this.gameId === childIds[0];
                    const data: any = isLeft ? { leftPlayerId: winnerId } : { rightPlayerId: winnerId };

                    await db.game.update({
                        where: { id: currentGame.nextGameId },
                        data
                    });

                    console.log(`Tournament Game ${this.gameId}: Winner ${winnerId} advanced to next game ${currentGame.nextGameId}`);

                    if (this.socketNamespace) {
                        this.socketNamespace.to(this.tournamentId).emit('tournament-game-completed', {
                            gameId: this.gameId,
                            winnerId: winnerId,
                            nextGameId: currentGame.nextGameId,
                            leftScore: this.scores.left,
                            rightScore: this.scores.right
                        });
                    }
                }
            } else { // Torneo completato
                console.log(`Tournament ${this.tournamentId} completed! Winner: ${winnerId}`);

                await db.tournament.update({
                    where: { id: this.tournamentId },
                    data: { 
                        endDate: new Date(),
                        winnerId: winnerId,
                        status: 'COMPLETED'
                    }
                });

                await updateTournamentWinnerStats(db, winnerId);

                if (this.socketNamespace) {
                    this.socketNamespace.to(this.tournamentId).emit('tournament-completed', {
                        tournamentId: this.tournamentId,
                        winnerId: winnerId
                    });
                }
            }

        } catch (error) {
            console.error(`Tournament Game ${this.gameId} advancement failed:`, error);
        }
    }
}
