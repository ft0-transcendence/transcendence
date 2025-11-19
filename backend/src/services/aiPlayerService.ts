import { PrismaClient } from "@prisma/client";

export class AIPlayerService {
    private db: PrismaClient | any;

    constructor(db: PrismaClient | any) {
        this.db = db;
    }

    /**
     * Creates a temporary AI player for a specific tournament
     * AI players are identified by a special username pattern and email
     */
    async createTournamentAIPlayer(tournamentId: string): Promise<string> {
        const executeTransaction = async (tx: any) => {
            // Generate unique AI player identifier
            const aiPlayerNumber = await this.getNextAIPlayerNumber(tx, tournamentId);
            const aiUsername = `AI ${aiPlayerNumber}`;
            const aiEmail = `ai_player_${aiPlayerNumber}_${tournamentId}@tournament.ai`;

            // Create AI user in database
            const aiPlayer = await tx.user.create({
                data: {
                    email: aiEmail,
                    username: aiUsername,
                    // AI players have no image and default language
                    preferredLanguage: 'en'
                }
            });

            return aiPlayer.id;
        };

        if ('$transaction' in this.db) {
            return await this.db.$transaction(executeTransaction);
        } else {
            return await executeTransaction(this.db);
        }
    }

    /**
     * Gets the next available AI player number for a tournament
     * This ensures unique AI player names within a tournament
     */
    private async getNextAIPlayerNumber(tx: any, tournamentId: string): Promise<number> {
        // Find existing AI players for this tournament
        const existingAIPlayers = await tx.user.findMany({
            where: {
                email: {
                    contains: `_${tournamentId}@tournament.ai`
                }
            },
            select: { username: true }
        });

        // Extract numbers from existing AI player usernames
        const existingNumbers = existingAIPlayers
            .map((player: any) => {
                const match = player.username.match(/AI (\d+)/);
                return match ? parseInt(match[1]) : 0;
            })
            .filter((num: number) => num > 0);

        // Return next available number
        if (existingNumbers.length === 0) {
            return 1;
        }

        const maxNumber = Math.max(...existingNumbers);
        return maxNumber + 1;
    }

    /**
     * Handles AI vs AI matches automatically (simulates the match)
     * AI vs Human matches should be played normally, not simulated
     */
    async handleAIvsAIMatch(gameId: string): Promise<void> {
        const executeTransaction = async (tx: any) => {
            const game = await tx.game.findUnique({
                where: { id: gameId },
                include: {
                    leftPlayer: true,
                    rightPlayer: true
                }
            });

            if (!game) {
                throw new Error(`Game ${gameId} not found`);
            }

            const isLeftPlayerAI = this.isAIPlayer(game.leftPlayer.email);
            const isRightPlayerAI = this.isAIPlayer(game.rightPlayer.email);

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

            // If there's a next game, advance the winner
            if (game.nextGameId) {
                const winnerId = game.leftPlayerId;
                await this.advanceWinnerToNextGame(tx, game.nextGameId, winnerId);
            }
        };

        if ('$transaction' in this.db) {
            await this.db.$transaction(executeTransaction);
        } else {
            await executeTransaction(this.db);
        }
    }

    private async advanceWinnerToNextGame(tx: any, nextGameId: string, winnerId: string): Promise<void> {
        const nextGame = await tx.game.findUnique({
            where: { id: nextGameId }
        });

        if (!nextGame) {
            throw new Error(`Next game ${nextGameId} not found`);
        }

        if (!nextGame.leftPlayerId || nextGame.leftPlayerId === '') {
            await tx.game.update({
                where: { id: nextGameId },
                data: { leftPlayerId: winnerId }
            });
        } else if (!nextGame.rightPlayerId || nextGame.rightPlayerId === '') {
            await tx.game.update({
                where: { id: nextGameId },
                data: { rightPlayerId: winnerId }
            });
        } else {
            throw new Error(`Next game ${nextGameId} is already full`);
        }
    }

    async cleanupTournamentAIPlayers(tournamentId: string): Promise<void> {
        const executeTransaction = async (tx: any) => {
            // Find all AI players for this tournament
            const aiPlayers = await tx.user.findMany({
                where: {
                    email: {
                        contains: `_${tournamentId}@tournament.ai`
                    }
                }
            });

            // Delete AI players
            for (const aiPlayer of aiPlayers) {
                await tx.user.delete({
                    where: { id: aiPlayer.id }
                });
            }

            console.log(`Cleaned up ${aiPlayers.length} AI players for tournament ${tournamentId}`);
        };

        if ('$transaction' in this.db) {
            await this.db.$transaction(executeTransaction);
        } else {
            await executeTransaction(this.db);
        }
    }

    isAIPlayer(email: string): boolean {
        return email.includes('@tournament.ai');
    }

    async getTournamentAIPlayers(tournamentId: string): Promise<string[]> {
        const aiPlayers = await this.db.user.findMany({
            where: {
                email: {
                    contains: `_${tournamentId}@tournament.ai`
                }
            },
            select: { id: true }
        });

        return aiPlayers.map((player: any) => player.id);
    }

    async isAIvsAIGame(gameId: string): Promise<boolean> {
        const game = await this.db.game.findUnique({
            where: { id: gameId },
            include: {
                leftPlayer: true,
                rightPlayer: true
            }
        });

        if (!game) {
            return false;
        }

        return this.isAIPlayer(game.leftPlayer.email) && this.isAIPlayer(game.rightPlayer.email);
    }

    async hasAIPlayer(gameId: string): Promise<boolean> {
        const game = await this.db.game.findUnique({
            where: { id: gameId },
            include: {
                leftPlayer: true,
                rightPlayer: true
            }
        });

        if (!game) {
            return false;
        }

        return this.isAIPlayer(game.leftPlayer.email) || this.isAIPlayer(game.rightPlayer.email);
    }
}