import { GameType, PrismaClient } from '@prisma/client';

import { updateGameStats } from '../utils/statsUtils';
import { STANDARD_GAME_CONFIG } from '../../game/game';

export type CreateVsGameParams = {
	gameId?: string;
	leftPlayerId: string;
	rightPlayerId: string;
	leftPlayerUsername?: string | null;
	rightPlayerUsername?: string | null;
	scoreGoal?: number;
	startDate?: Date;
};

export type FinalizeVsGameParams = {
	gameId: string;
	leftPlayerId: string;
	rightPlayerId: string;
	scores: { left: number; right: number };
	isForfeited: boolean;
	finishedAt?: Date;
};

/**
 * //TODO: remove this function and use the db.game.create method instead.
 * @deprecated Should not be used anymore. Use the db.game.create method instead.
 */
export async function createVsGameRecord(db: PrismaClient, params: CreateVsGameParams) {
	const {
		gameId,
		leftPlayerId,
		rightPlayerId,
		leftPlayerUsername = null,
		rightPlayerUsername = null,
		scoreGoal = STANDARD_GAME_CONFIG.maxScore,
		startDate = new Date(),
	} = params;

	const existing = await db.game.findUnique({
		where: { id: gameId },
		select: { id: true },
	});

	if (existing) {
		return;
	}

	return await db.game.create({
		data: {
			id: gameId,
			type: GameType.VS,
			startDate,
			scoreGoal: scoreGoal!,
			leftPlayerId,
			rightPlayerId,
			leftPlayerUsername,
			rightPlayerUsername,
		},
	});
}

export async function finalizeVsGameResult(db: PrismaClient, params: FinalizeVsGameParams): Promise<void> {
	const finishDate = params.finishedAt ?? new Date();

	await createVsGameRecord(db, {
		gameId: params.gameId,
		leftPlayerId: params.leftPlayerId,
		rightPlayerId: params.rightPlayerId,
		startDate: finishDate,
	});

	const updateData: {
		endDate: Date;
		leftPlayerScore: number;
		rightPlayerScore: number;
		abortDate?: Date | null;
	} = {
		endDate: finishDate,
		leftPlayerScore: params.scores.left,
		rightPlayerScore: params.scores.right,
		abortDate: params.isForfeited ? finishDate : null,
	};

	await db.game.update({
		where: { id: params.gameId },
		data: updateData,
	});

	if (params.scores.left === params.scores.right) {
		return;
	}

	const leftWins = params.scores.left > params.scores.right;
	const winnerId = leftWins ? params.leftPlayerId : params.rightPlayerId;
	const loserId = leftWins ? params.rightPlayerId : params.leftPlayerId;

	await updateGameStats(db, winnerId, loserId);
}

