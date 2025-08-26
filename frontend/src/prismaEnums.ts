/**
 * This file is used to map the Prisma enums to the frontend enums.
 * This process is necessary because we can only infer the types from backend code to frontend code.
 * If any changes are made to the Prisma enums, this file needs to be updated, but fortunatelly typescript will
 * warn us if we forget to update it.
 */
import type { GameType } from '@shared';


export const GameTypeObj: Record<GameType, any> = {
	AI: 'AI',
	VS: 'VS',
	TOURNAMENT: 'TOURNAMENT',
}
