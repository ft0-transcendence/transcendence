import { OnlineGame } from "./onlineGame";
import { GameUserInfo, GameStatus } from "./game";
import { db } from "../src/trpc/db";
import { updateTournamentWinnerStats, updateGameStats } from "../src/utils/statsUtils";
import { AIPlayerService } from "../src/services/aiPlayerService";
import { cache } from "../src/cache";

type TournamentGameFinishCallback = (state: GameStatus, tournamentId: string, gameId: string) => Promise<void>;

export class TournamentGame extends OnlineGame {
    public readonly tournamentId: string;
    private onTournamentFinish?: TournamentGameFinishCallback;
    private aiPlayerService: AIPlayerService;
    private aiIntervals: Map<string, NodeJS.Timeout> = new Map();

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
        this.aiPlayerService = new AIPlayerService(db);
    }

    public async finish() {
        if (this.finished) return;
        this.finished = true;

        console.log(`Tournament Game ${this.gameId} finishing with scores: ${this.scores.left}-${this.scores.right}`);

        // Stop all AI intervals
        for (const interval of this.aiIntervals.values()) {
            clearInterval(interval);
        }
        this.aiIntervals.clear();

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

                // Use transaction to ensure atomicity
                await db.$transaction(async (tx) => {
                    await tx.tournament.update({
                        where: { id: this.tournamentId },
                        data: { 
                            endDate: new Date(),
                            winnerId: winnerId,
                            status: 'COMPLETED'
                        }
                    });

                    const aiPlayerService = new AIPlayerService(tx);
                    await aiPlayerService.cleanupTournamentAIPlayers(this.tournamentId);
                });

                await updateTournamentWinnerStats(db, winnerId);


                const cachedTournament = cache.tournaments.active.get(this.tournamentId);
                if (cachedTournament) {
                    cachedTournament.status = 'COMPLETED';
                    cachedTournament.aiPlayers.clear();
                }

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

    public override playerReady(player: GameUserInfo) {
        super.playerReady(player);

        // Check if we need to start AI after both players are ready
        if (this.leftPlayer && this.rightPlayer) {
            this.initializeAI();
        }
    }

    private async initializeAI() {
        try {
            if (!this.leftPlayer || !this.rightPlayer) return;

            // Check if left player is AI
            const leftPlayerData = await db.user.findUnique({
                where: { id: this.leftPlayer.id },
                select: { email: true }
            });

            if (leftPlayerData && this.aiPlayerService.isAIPlayer(leftPlayerData.email)) {
                this.startAI(this.leftPlayer.id, 'left');
            }

            // Check if right player is AI
            const rightPlayerData = await db.user.findUnique({
                where: { id: this.rightPlayer.id },
                select: { email: true }
            });

            if (rightPlayerData && this.aiPlayerService.isAIPlayer(rightPlayerData.email)) {
                this.startAI(this.rightPlayer.id, 'right');
            }

        } catch (error) {
            console.error(`Failed to initialize AI for game ${this.gameId}:`, error);
        }
    }

    private startAI(playerId: string, side: 'left' | 'right') {
        console.log(`Starting AI for player ${playerId} on ${side} side in game ${this.gameId}`);

        const aiLogic = () => {
            try {
                const state = this.getState();
                
                // Only move if game is running
                if (state.state !== 'RUNNING') return;

                // AI movement logic - same as local AI games
                const aiPaddlePos = side === 'left' ? state.paddles.left : state.paddles.right;
                let target = 50; // Default center position

                // Only move when ball is coming towards AI
                if (side === 'right' && state.ball.dirX >= 0) {
                    target = state.ball.y;
                } else if (side === 'left' && state.ball.dirX <= 0) {
                    target = state.ball.y;
                }

                const diff = target - aiPaddlePos;
                const deadZone = 5; // Dead zone to prevent micro-adjustments

                this.release(side, 'up');
                this.release(side, 'down');

                if (Math.abs(diff) > deadZone) {
                    if (diff > 0) {
                        this.press(side, 'down');
                    } else {
                        this.press(side, 'up');
                    }
                }
            } catch (error) {
                console.error(`AI error for player ${playerId}:`, error);
            }
        };

        const interval = setInterval(aiLogic, 1000 / 60);
        this.aiIntervals.set(playerId, interval);
    }
}
