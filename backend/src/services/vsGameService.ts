import { GameType, PrismaClient } from '@prisma/client';

import { updateGameStats } from '../utils/statsUtils';

export type CreateVsGameParams = {
	gameId: string;
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

export async function createVsGameRecord(db: PrismaClient, params: CreateVsGameParams): Promise<void> {
	const {
		gameId,
		leftPlayerId,
		rightPlayerId,
		leftPlayerUsername = null,
		rightPlayerUsername = null,
		scoreGoal = 5,
		startDate = new Date(),
	} = params;

	const existing = await db.game.findUnique({
		where: { id: gameId },
		select: { id: true },
	});

	if (existing) {
		return;
	}

	await db.game.create({
		data: {
			id: gameId,
			type: GameType.VS,
			startDate,
			scoreGoal,
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

