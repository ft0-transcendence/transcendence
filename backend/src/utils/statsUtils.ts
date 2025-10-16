import { PrismaClient } from '@prisma/client';

/**
 * Updates player statistics after a game ends
 * @param db - Prisma database client
 * @param winnerId - ID of the winning player
 * @param loserId - ID of the losing player
 */
export async function updateGameStats(
    db: PrismaClient,
    winnerId: string,
    loserId: string
): Promise<void> {
    try {
        // Update winner's stats
        await db.user.update({
            where: { id: winnerId },
            data: {
                totalWins: {
                    increment: 1
                }
            }
        });

        // Update loser's stats
        await db.user.update({
            where: { id: loserId },
            data: {
                totalLosses: {
                    increment: 1
                }
            }
        });

        console.log(`📊 Stats updated: ${winnerId} won, ${loserId} lost`);
    } catch (error) {
        console.error('❌ Failed to update game stats:', error);
        throw error;
    }
}

/**
 * Updates tournament winner statistics
 * @param db - Prisma database client
 * @param winnerId - ID of the tournament winner
 */
export async function updateTournamentWinnerStats(
    db: PrismaClient,
    winnerId: string
): Promise<void> {
    try {
        await db.user.update({
            where: { id: winnerId },
            data: {
                tournamentsWon: {
                    increment: 1
                }
            }
        });

        console.log(`🏆 Tournament winner stats updated for: ${winnerId}`);
    } catch (error) {
        console.error('❌ Failed to update tournament winner stats:', error);
        throw error;
    }
}
