import { PrismaClient } from "@prisma/client";

export class AIPlayerService {
    private db: PrismaClient | any;

    constructor(db: PrismaClient | any) {
        this.db = db;
    }

    /**
     * Marks a game position as AI player by setting username to null
     * No need to create fake users anymore - just mark the position as AI
     */
    async assignAIPlayerToGame(gameId: string, position: 'left' | 'right'): Promise<void> {
        const updateData = position === 'left' 
            ? { leftPlayerUsername: null }
            : { rightPlayerUsername: null };

        await this.db.game.update({
            where: { id: gameId },
            data: updateData
        });
    }

    /**
     * Handles AI vs AI matches automatically (simulates the match)
     * AI vs Human matches should be played normally, not simulated
     */
    async handleAIvsAIMatch(gameId: string): Promise<void> {
        const executeTransaction = async (tx: any) => {
            const game = await tx.game.findUnique({
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

            // AI vs AI: left player wins (arbitrary choice for simulation)
            const leftScore = 7;
            const rightScore = 0;

            await tx.game.update({
                where: { id: gameId },
                data: {
                    leftPlayerScore: leftScore,
                    rightPlayerScore: rightScore,
                    endDate: new Date()
                }
            });

            // If there's a next game, advance the AI winner to next game
            if (game.nextGameId) {
                await this.advanceAIWinnerToNextGame(tx, game.nextGameId);
            }
        };

        if ('$transaction' in this.db) {
            await this.db.$transaction(executeTransaction);
        } else {
            await executeTransaction(this.db);
        }
    }

    private async advanceAIWinnerToNextGame(tx: any, nextGameId: string): Promise<void> {
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

        // Assign AI player to the first available position
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

    /**
     * No cleanup needed anymore since we don't create fake AI users
     * AI players are just marked with null username in games
     */

    isAIPlayer(username: string | null): boolean {
        return username === null;
    }

    /**
     * Gets all games in a tournament that have AI players (null username)
     */
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

        return aiGames.map((game: any) => game.id);
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