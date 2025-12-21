import { GameConfig } from "./game/game";

export const CONSTANTS = {
	AI_USERNAME: "AI",
}

export const MAX_PROFILE_PICTURE_SIZE_MB = 2.5;
export const MAX_PROFILE_PICTURE_SIZE_BYTES = MAX_PROFILE_PICTURE_SIZE_MB * 1024 * 1024;


export const STANDARD_GAME_CONFIG: GameConfig = {
	debug: false,
	shouldUseRequestAnimationFrame: false,
	gameStartCountdown: 3000,
	maxScore: 1,
	initialVelocity: 0.05,
	velocityIncrease: 0.000005,
	maxVelocity: 0.16,
	paddleSpeed: 3,
	movementSensitivity: 0.5,
	paddleHeightPercentage: 20,
	paddleWidthPercentage: 5,
};

export enum AiAccuracy {
	LOW = 0.25,
	MEDIUM = 0.5,
	HIGH = 0.75,
	MAX = 1,
}
