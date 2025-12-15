import { TRPCError } from "@trpc/server";
import { PrismaClient, Tournament, TournamentStatus, TournamentType } from "@prisma/client";
import { z } from "zod";
import { app } from "../../main";
import { cache } from "../cache";
import { AIPlayerService } from "../services/aiPlayerService";


export const tournamentValidationSchemas = {
	tournamentId: z.string().min(1, "Tournament ID is required"),

	createTournament: z.object({
		name: z.string()
			.min(3, "Tournament name must be at least 3 characters")
			.max(50, "Tournament name cannot exceed 50 characters"),
		type: z.nativeEnum(TournamentType),
		startDate: z.string().datetime().optional()
	}),

	gameId: z.string().min(1, "Game ID is required"),
	userId: z.string().min(1, "User ID is required"),

	// New schemas for username-based AI detection
	gameWithUsernames: z.object({
		leftPlayerUsername: z.string().nullable(),
		rightPlayerUsername: z.string().nullable(),
		leftPlayerId: z.string(),
		rightPlayerId: z.string()
	}),

	aiPlayerValidation: z.object({
		username: z.string().nullable(),
		isAI: z.boolean()
	}),

	tournamentBracketValidation: z.object({
		tournamentId: z.string().min(1),
		validateAIConfiguration: z.boolean().default(true),
		validateUsernameConsistency: z.boolean().default(true)
	})
};

export class TournamentValidator {

	static validateTournamentExists(tournament: Tournament | null, tournamentId: string): void {
		if (!tournament) {
			throw new TRPCError({
				code: 'NOT_FOUND',
				message: 'Tournament not found'
			});
		}
	}

	static validateCreatorPermission(tournamentCreatorId: string, requestingUserId: string, operation: string): void {
		if (tournamentCreatorId !== requestingUserId) {
			throw new TRPCError({
				code: 'FORBIDDEN',
				message: `Only the tournament creator can ${operation}`
			});
		}
	}

	static validateTournamentStatus(status: TournamentStatus, allowedStatuses: TournamentStatus[], operation: string): void {
		if (!allowedStatuses.includes(status)) {
			throw new TRPCError({
				code: 'BAD_REQUEST',
				message: `Cannot ${operation} tournament with status ${status}`
			});
		}
	}

	static validateParticipantCapacity(currentCount: number, maxCount: number): void {
		if (currentCount >= maxCount) {
			throw new TRPCError({
				code: 'BAD_REQUEST',
				message: 'Tournament is full'
			});
		}
	}

	static validateAlreadyJoined(alreadyJoined: boolean): void {
		if (alreadyJoined) {
			throw new TRPCError({
				code: 'BAD_REQUEST',
				message: 'Already joined this tournament'
			});
		}
	}

	static validateNotParticipant(isParticipant: boolean): void {
		if (!isParticipant) {
			throw new TRPCError({
				code: 'BAD_REQUEST',
				message: 'You are not a participant in this tournament'
			});
		}
	}

	static validateBracketExists(gamesCount: number): void {
		if (gamesCount < 0) {
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: 'Invalid tournament state'
			});
		}
	}

	static validateAIPlayerByUsername(username: string | null, db: PrismaClient): boolean {
		const aiPlayerService = new AIPlayerService(db);
		return aiPlayerService.isAIPlayer(username);
	}

	static validateGameAIConfiguration(
		leftPlayerUsername: string | null,
		rightPlayerUsername: string | null,
		db: PrismaClient
	): { leftIsAI: boolean; rightIsAI: boolean; isAIGame: boolean } {
		const aiPlayerService = new AIPlayerService(db);
		const leftIsAI = aiPlayerService.isAIPlayer(leftPlayerUsername);
		const rightIsAI = aiPlayerService.isAIPlayer(rightPlayerUsername);
		const isAIGame = leftIsAI || rightIsAI;

		return { leftIsAI, rightIsAI, isAIGame };
	}

	static async validateTournamentBracketConsistency(tournamentId: string, db: PrismaClient): Promise<void> {
		try {
			const tournament = await db.tournament.findUnique({
				where: { id: tournamentId },
				include: {
					games: {
						select: {
							id: true,
							leftPlayerUsername: true,
							rightPlayerUsername: true,
							leftPlayerId: true,
							rightPlayerId: true,
							type: true,
							startDate: true
						}
					}
				}
			});

			if (!tournament) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Tournament not found for bracket validation'
				});
			}

			const aiPlayerService = new AIPlayerService(db);
			const inconsistencies: string[] = [];

			for (const game of tournament.games) {
				if (!game.startDate) continue;
				const leftIsAI = aiPlayerService.isAIPlayer(game.leftPlayerUsername);
				const rightIsAI = aiPlayerService.isAIPlayer(game.rightPlayerUsername);
				const hasAI = leftIsAI && rightIsAI;

				// Validate that AI games have the correct type
				if (hasAI && game.type !== 'AI') {
					inconsistencies.push(`Game ${game.id} has AI players but type is not 'AI'`);
				}

				if (game.leftPlayerUsername === undefined || game.rightPlayerUsername === undefined) {
					inconsistencies.push(`Game ${game.id} has undefined username fields`);
				}
			}

			if (inconsistencies.length > 0) {
				app.log.warn({
					tournament_id: tournamentId,
					inconsistencies
				}, 'Tournament bracket inconsistencies detected');
			}

		} catch (error) {
			app.log.error({
				tournament_id: tournamentId,
				error: (error as Error).message
			}, 'Failed to validate tournament bracket consistency');
		}
	}

	static validateAIvsAIGameConfiguration(
		leftPlayerUsername: string | null,
		rightPlayerUsername: string | null,
		db: PrismaClient
	): boolean {
		const aiPlayerService = new AIPlayerService(db);
		return aiPlayerService.isAIPlayer(leftPlayerUsername) && aiPlayerService.isAIPlayer(rightPlayerUsername);
	}


}

// Simple error handling with logging
export function handleTournamentError(error: Error, operation: string, tournamentId?: string, userId?: string): never {
	// Log the error
	app.log.error({
		operation,
		tournament_id: tournamentId,
		user_id: userId,
		error: error.message,
		stack: error.stack
	}, `Tournament ${operation} failed`);

	// Re-throw TRPC errors as-is
	if (error instanceof TRPCError) {
		throw error;
	}

	// Handle database errors
	if (error.message.includes('Unique constraint')) {
		throw new TRPCError({
			code: 'CONFLICT',
			message: 'Operation conflicts with existing data'
		});
	}

	if (error.message.includes('Foreign key constraint')) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'Cannot perform operation due to data dependencies'
		});
	}

	if (error.message.includes('Record to delete does not exist')) {
		throw new TRPCError({
			code: 'NOT_FOUND',
			message: 'Resource not found'
		});
	}

	// Default error
	throw new TRPCError({
		code: 'INTERNAL_SERVER_ERROR',
		message: 'An unexpected error occurred'
	});
}

/**
 * // TODO: is it needed?
 * Enhanced cache consistency check with AI player validation
 */
export function validateCacheConsistency(tournamentId: string, db: PrismaClient): void {
	// Simple async check without blocking the main operation
	setTimeout(async () => {
		try {
			const cachedTournament = cache.tournaments.active.get(tournamentId);

			if (cachedTournament) {
				// Simple check - if cache exists, verify basic data
				const dbTournament = await db.tournament.findUnique({
					where: { id: tournamentId },
					include: {
						participants: true,
						games: {
							select: {
								id: true,
								leftPlayerUsername: true,
								rightPlayerUsername: true,
								type: true
							}
						}
					}
				});

				if (!dbTournament) {
					app.log.warn(`Tournament ${tournamentId} exists in cache but not in database`);
					cache.tournaments.active.delete(tournamentId);
				} else {
					// Check participant count consistency
					if (cachedTournament.participants.size !== dbTournament.participants.length) {
						app.log.warn(`Participant count mismatch for tournament ${tournamentId}`);
					}
					// Validate bracket consistency with username system
					await TournamentValidator.validateTournamentBracketConsistency(tournamentId, db);
				}
			}
		} catch (error) {
			app.log.error(`Cache consistency check failed for tournament ${tournamentId}: ${(error as Error).message}`);
		}
	}, 0);
}
