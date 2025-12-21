import type { GameType, AppRouter, RouterInputs, RouterOutputs, SocketFriendInfo, TournamentRoundType } from '../backend/shared_exports';

import { Game as GameClass, GameStatus, GameConfig, GameUserInfo, MovePaddleAction, Ball, Paddles, Scores, GameState } from '../backend/game/game';
import { STANDARD_GAME_CONFIG, AiAccuracy } from '../backend/constants';
import { AIBrain } from '../backend/game/AIBrain';

export type {
	AppRouter,
	RouterOutputs,
	RouterInputs,
	GameType,
	SocketFriendInfo,
	TournamentRoundType
};

export type Game = {
	GameType: GameType;
	Game: typeof GameClass;
	GameStatus: GameStatus;
	GameConfig: GameConfig;
	GameUserInfo: GameUserInfo;
	MovePaddleAction: MovePaddleAction;
	Ball: Ball;
	Paddles: Paddles;
	Scores: Scores;
	GameState: GameState;
}

export {
	GameClass,
	STANDARD_GAME_CONFIG,
	AIBrain,
	AiAccuracy
}
