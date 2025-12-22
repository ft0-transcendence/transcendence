import { TRPCError } from "@trpc/server";
import { Tournament, TournamentStatus, TournamentType } from "@prisma/client";
import { z } from "zod";
import { app } from "../../main";


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
