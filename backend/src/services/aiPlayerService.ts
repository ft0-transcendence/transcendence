import { STANDARD_GAME_CONFIG } from "../../shared_exports";
import { Prisma, PrismaClient } from "@prisma/client";
import { checkAndCreateNextRoundInstances } from "../trpc/routes/tournament";
import { app } from "../../main";

export class AIPlayerService {
    private db: PrismaClient | Prisma.TransactionClient;

    constructor(db: PrismaClient | Prisma.TransactionClient) {
        this.db = db;
    }

    async assignAIPlayerToGame(gameId: string, position: 'left' | 'right'): Promise<void> {
        const updateData = position === 'left'
            ? { leftPlayerUsername: null }
            : { rightPlayerUsername: null };

        await this.db.game.update({
            where: { id: gameId },
            data: updateData
        });
    }

    async handleAIvsAIMatch(gameId: string): Promise<void> {
        app.log.debug(`🤖 Starting AI vs AI simulation for game ${gameId}`);

        // Avvia simulazione con Promise
        return new Promise((resolve, reject) => {
            let leftScore = 0;
            let rightScore = 0;
            const maxScore = STANDARD_GAME_CONFIG.maxScore || 5;

            app.log.debug(`🎮 AI Match ${gameId} - Target score: ${maxScore}`);

            // Ogni 5 secondi un AI casuale segna
            const simulationInterval = setInterval(async () => {
                try {
                    const leftScores = Math.random() > 0.5;

                    if (leftScores) {
                        leftScore++;
                        app.log.debug(`🎯 Game ${gameId} - Left AI scored! Score: ${leftScore}-${rightScore}`);
                    } else {
                        rightScore++;
                        app.log.debug(`🎯 Game ${gameId} - Right AI scored! Score: ${leftScore}-${rightScore}`);
                    }

                    if (leftScore >= maxScore || rightScore >= maxScore) {
                        clearInterval(simulationInterval);

                        app.log.debug(`✅ AI Match ${gameId} completed: ${leftScore}-${rightScore}`);

                        await this.saveAIMatchResult(gameId, leftScore, rightScore);

                        resolve();
                    } else {
						await this.db.game.update({
							where: { id: gameId },
							data: {
								leftPlayerScore: leftScore,
								rightPlayerScore: rightScore
							}
						});

					}
                } catch (error) {
                    clearInterval(simulationInterval);
                    app.log.error(`❌ Error during AI match simulation for game ${gameId}:`, error);
                    reject(error);
                }
            }, 5000);
        });
    }

    private async saveAIMatchResult(
        gameId: string,
        leftScore: number,
        rightScore: number
    ): Promise<void> {
        const executeTransaction = async (tx: Prisma.TransactionClient) => {
            const game = await tx.game.findUnique({
                where: { id: gameId },
                select: {
                    id: true,
                    nextGameId: true,
                    leftPlayerId: true,
                    rightPlayerId: true,
                    tournamentId: true,
                    tournamentRound: true
                }
            });

            if (!game) {
                throw new Error(`Game ${gameId} not found when saving result`);
            }

            app.log.debug(`💾 Saving AI match result for game ${gameId}: ${leftScore}-${rightScore}`);

            await tx.game.update({
                where: { id: gameId },
                data: {
                    leftPlayerScore: leftScore,
                    rightPlayerScore: rightScore,
                    endDate: new Date()
                }
            });

            if (game.nextGameId) {
                app.log.debug(`➡️ Advancing AI winner to next game ${game.nextGameId}`);
                const nextGameBecameAIvsAI = await this.advanceAIWinnerToNextGame(tx, game.nextGameId);

                if (nextGameBecameAIvsAI) {
                    app.log.debug(`🎮 Next game ${game.nextGameId} is now AI vs AI, starting simulation`);
                    setTimeout(() => {
                        this.handleAIvsAIMatch(game.nextGameId!).catch((error) => {
                            app.log.debug(`❌ Failed to start AI vs AI simulation for game ${game.nextGameId}:`, error);
                        });
                    }, 100);
                }
            }

            app.log.debug(`✅ AI match ${gameId} saved successfully`);
        };

        if ('$transaction' in this.db) {
            await this.db.$transaction(executeTransaction);
        } else {
            await executeTransaction(this.db);
        }

        // Check if we need to create game instances for the next round (after transaction completes)
        const game = await this.db.game.findUnique({
            where: { id: gameId },
            select: { tournamentId: true, tournamentRound: true }
        });

        if (game?.tournamentId && game?.tournamentRound) {
            const mainDb = '$transaction' in this.db ? this.db : this.db;
            await checkAndCreateNextRoundInstances(mainDb as any, game.tournamentId, game.tournamentRound);
        }
    }

    private async advanceAIWinnerToNextGame(tx: Prisma.TransactionClient, nextGameId: string): Promise<boolean> {
        const EMPTY_SLOT = 'Empty slot';

        const nextGame = await tx.game.findUnique({
            where: { id: nextGameId },
            select: {
                leftPlayerUsername: true,
                rightPlayerUsername: true,
				leftPlayerId: true,
				rightPlayerId: true,
            }
        });

        if (!nextGame) {
            throw new Error(`Next game ${nextGameId} not found`);
        }

		const needLastPlayerToStart = this.isAIPlayer(nextGame.leftPlayerUsername) || this.isAIPlayer(nextGame.rightPlayerUsername)
			|| !!nextGame.leftPlayerId || !!nextGame.rightPlayerId;

        let slotFilled = false;
        let leftSlotIsAI = this.isAIPlayer(nextGame.leftPlayerUsername);
        let rightSlotIsAI = this.isAIPlayer(nextGame.rightPlayerUsername);

		const commonUpdateData = needLastPlayerToStart ? { startDate: new Date() } : {};

        if (nextGame.leftPlayerUsername === EMPTY_SLOT || nextGame.leftPlayerUsername === undefined) {
            const updateResult = await tx.game.updateMany({
                where: {
                    id: nextGameId,
                    OR: [
                        { leftPlayerUsername: EMPTY_SLOT },
                        { leftPlayerUsername: undefined }
                    ]
                },
                data: { leftPlayerUsername: null, ...commonUpdateData.startDate }
            });

            if (updateResult.count > 0) {
                app.log.debug(`✅ AI winner advanced to next game ${nextGameId} (left slot)`);
                leftSlotIsAI = true;
                slotFilled = true;
            }
        }

        if (!slotFilled && (nextGame.rightPlayerUsername === EMPTY_SLOT || nextGame.rightPlayerUsername === undefined)) {
            const updateResult = await tx.game.updateMany({
                where: {
                    id: nextGameId,
                    OR: [
                        { rightPlayerUsername: EMPTY_SLOT },
                        { rightPlayerUsername: undefined }
                    ]
                },
                data: { rightPlayerUsername: null, ...commonUpdateData }
            });

            if (updateResult.count > 0) {
                app.log.debug(`✅ AI winner advanced to next game ${nextGameId} (right slot)`);
                rightSlotIsAI = true;
                slotFilled = true;
            }
        }

        if (!slotFilled) {
            app.log.debug(`⚠️ Next game ${nextGameId} is already full, skipping advancement`);
            return false;
        }

        return leftSlotIsAI && rightSlotIsAI;
    }


    isAIPlayer(username: string | null): boolean {
        return username === null;
    }

    async getTournamentAIGames(tournamentId: string): Promise<string[]> {
        const aiGames = await this.db.game.findMany({
            where: {
                tournamentId: tournamentId,
                OR: [
                    { leftPlayerUsername: null },
                    { rightPlayerUsername: null }
                ]
            },
            select: { id: true }
        });

        return aiGames.map((game) => game.id);
    }



    async isAIvsAIGame(gameId: string): Promise<boolean> {
        const game = await this.db.game.findUnique({
            where: { id: gameId },
            select: {
                leftPlayerUsername: true,
                rightPlayerUsername: true
            }
        });

        if (!game) {
            return false;
        }

        return this.isAIPlayer(game.leftPlayerUsername) && this.isAIPlayer(game.rightPlayerUsername);
    }

    async hasAIPlayer(gameId: string): Promise<boolean> {
        const game = await this.db.game.findUnique({
            where: { id: gameId },
            select: {
                leftPlayerUsername: true,
                rightPlayerUsername: true
            }
        });

        if (!game) {
            return false;
        }

        return this.isAIPlayer(game.leftPlayerUsername) || this.isAIPlayer(game.rightPlayerUsername);
    }
}
