import { STANDARD_GAME_CONFIG } from "../../shared_exports";
import { Prisma, PrismaClient } from "@prisma/client";

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
        const game = await this.db.game.findUnique({
            where: { id: gameId },
            select: {
                id: true,
                nextGameId: true,
                leftPlayerUsername: true,
                rightPlayerUsername: true
            }
        });

        if (!game) {
            throw new Error(`Game ${gameId} not found`);
        }

        const isLeftPlayerAI = this.isAIPlayer(game.leftPlayerUsername);
        const isRightPlayerAI = this.isAIPlayer(game.rightPlayerUsername);

        if (!isLeftPlayerAI || !isRightPlayerAI) {
            throw new Error(`Game ${gameId} is not an AI vs AI match`);
        }

        console.log(`🤖 Starting AI vs AI simulation for game ${gameId}`);

        // Avvia simulazione con Promise
        return new Promise((resolve, reject) => {
            let leftScore = 0;
            let rightScore = 0;
            const maxScore = STANDARD_GAME_CONFIG.maxScore || 5;

            console.log(`🎮 AI Match ${gameId} - Target score: ${maxScore}`);

            // Ogni 5 secondi un AI casuale segna
            const simulationInterval = setInterval(async () => {
                try {
                    const leftScores = Math.random() > 0.5;

                    if (leftScores) {
                        leftScore++;
                        console.log(`🎯 Game ${gameId} - Left AI scored! Score: ${leftScore}-${rightScore}`);
                    } else {
                        rightScore++;
                        console.log(`🎯 Game ${gameId} - Right AI scored! Score: ${leftScore}-${rightScore}`);
                    }

                    if (leftScore >= maxScore || rightScore >= maxScore) {
                        clearInterval(simulationInterval);

                        console.log(`✅ AI Match ${gameId} completed: ${leftScore}-${rightScore}`);

                        await this.saveAIMatchResult(gameId, leftScore, rightScore);

                        resolve();
                    }
                } catch (error) {
                    clearInterval(simulationInterval);
                    console.error(`❌ Error during AI match simulation for game ${gameId}:`, error);
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
                    rightPlayerId: true
                }
            });

            if (!game) {
                throw new Error(`Game ${gameId} not found when saving result`);
            }

            console.log(`💾 Saving AI match result for game ${gameId}: ${leftScore}-${rightScore}`);

            await tx.game.update({
                where: { id: gameId },
                data: {
                    leftPlayerScore: leftScore,
                    rightPlayerScore: rightScore,
                    endDate: new Date()
                }
            });

            if (game.nextGameId) {
                console.log(`➡️ Advancing AI winner to next game ${game.nextGameId}`);
                await this.advanceAIWinnerToNextGame(tx, game.nextGameId);
            }

            console.log(`✅ AI match ${gameId} saved successfully`);
        };

        if ('$transaction' in this.db) {
            await this.db.$transaction(executeTransaction);
        } else {
            await executeTransaction(this.db);
        }
    }

    private async advanceAIWinnerToNextGame(tx: Prisma.TransactionClient, nextGameId: string): Promise<void> {
        const nextGame = await tx.game.findUnique({
            where: { id: nextGameId },
            select: {
                leftPlayerUsername: true,
                rightPlayerUsername: true
            }
        });

        if (!nextGame) {
            throw new Error(`Next game ${nextGameId} not found`);
        }

        if (nextGame.leftPlayerUsername === undefined) {
            await tx.game.update({
                where: { id: nextGameId },
                data: { leftPlayerUsername: null }
            });
        } else if (nextGame.rightPlayerUsername === undefined) {
            await tx.game.update({
                where: { id: nextGameId },
                data: { rightPlayerUsername: null }
            });
        } else {
            throw new Error(`Next game ${nextGameId} is already full`);
        }
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
