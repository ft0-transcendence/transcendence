import type { GameType } from '@prisma/client';
import type { AppRouter, RouterInputs, RouterOutputs } from './src/trpc/root';
import { Game, GameUserInfo } from '../game/game';

export type {
	AppRouter,
	RouterOutputs,
	RouterInputs,
	GameType,
	GameUserInfo
};

export {
	Game
}
