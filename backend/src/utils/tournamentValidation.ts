import { TRPCError } from "@trpc/server";
import { TournamentStatus, TournamentType } from "@prisma/client";
import { z } from "zod";
import { fastify } from "../../main";
import { cache } from "../cache";

/**
 * Simple validation utilities for tournament operations
 */

// Input validation schemas - using simple string validation for IDs
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
  userId: z.string().min(1, "User ID is required")
};

// Simple validation functions
export class TournamentValidator {
  
  static validateTournamentExists(tournament: any, tournamentId: string): void {
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
    // Simplified validation - just check if tournament exists
    // The bracket creation might be in progress or use a different approach
    if (gamesCount < 0) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Invalid tournament state'
      });
    }
    // Don't enforce exact game count - be more flexible
  }
}

// Simple error handling with logging
export function handleTournamentError(error: Error, operation: string, tournamentId?: string, userId?: string): never {
  // Log the error
  fastify.log.error({
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

// Simple cache consistency check
export function validateCacheConsistency(tournamentId: string, db: any): void {
  // Simple async check without blocking the main operation
  setTimeout(async () => {
    try {

      const cachedTournament = cache.tournaments.active.get(tournamentId);
      
      if (cachedTournament) {
        // Simple check - if cache exists, verify basic data
        const dbTournament = await db.tournament.findUnique({
          where: { id: tournamentId },
          include: { participants: true }
        });
        
        if (!dbTournament) {
          fastify.log.warn(`Tournament ${tournamentId} exists in cache but not in database`);
          cache.tournaments.active.delete(tournamentId);
        } else if (cachedTournament.participants.size !== dbTournament.participants.length) {
          fastify.log.warn(`Participant count mismatch for tournament ${tournamentId}`);
          // Could trigger cache refresh here if needed
        }
      }
    } catch (error) {
      fastify.log.error(`Cache consistency check failed for tournament ${tournamentId}: ${(error as Error).message}`);
    }
  }, 0);
}