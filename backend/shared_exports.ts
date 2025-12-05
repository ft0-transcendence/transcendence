import type { GameType, TournamentRound } from '@prisma/client';
import type { AppRouter, RouterInputs, RouterOutputs } from './src/trpc/root';
import { Game, GameUserInfo, STANDARD_GAME_CONFIG } from './game/game';
import type { SocketFriendInfo } from './src/socket-io';

export type {
	AppRouter,
	RouterOutputs,
	RouterInputs,
	GameType,
	GameUserInfo,
	SocketFriendInfo,
};
export type TournamentRoundType = keyof typeof TournamentRound;

export {
	Game,
	STANDARD_GAME_CONFIG
}

export enum AppLanguage {
	ENGLISH = 'en',
	ITALIAN = 'it',
	UKRAINIAN = 'ua',
}
