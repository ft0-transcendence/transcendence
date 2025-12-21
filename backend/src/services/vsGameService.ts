import { GameType, PrismaClient, Game as PrismaGame } from '@prisma/client';

import { updateGameStats } from '../utils/statsUtils';
import { STANDARD_GAME_CONFIG } from '../../constants';

export type FinalizeVsGameParams = {
	gameId: PrismaGame['id'];
	leftPlayerId: PrismaGame['leftPlayerId'];
	rightPlayerId: PrismaGame['rightPlayerId'];
	scores: { left: number; right: number };
	isForfeited: boolean;
	finishedAt?: Date;
};

export async function finalizeVsGameResult(db: PrismaClient, params: FinalizeVsGameParams): Promise<void> {
	const finishDate = params.finishedAt ?? new Date();

	// Check if game already exists, if not create it
	const existing = await db.game.findUnique({
		where: { id: params.gameId },
		select: { id: true },
	});

	if (!existing) {
		await db.game.create({
			data: {
				id: params.gameId,
				type: GameType.VS,
				startDate: finishDate,
				scoreGoal: STANDARD_GAME_CONFIG.maxScore as number,
				leftPlayerId: params.leftPlayerId,
				rightPlayerId: params.rightPlayerId,
				leftPlayerUsername: null,
				rightPlayerUsername: null,
			},
		});
	}

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

