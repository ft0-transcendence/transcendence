import { GameType } from '@prisma/client';
import type {AppRouter, RouterInputs, RouterOutputs} from './src/trpc/root';


const GameTypeObj = GameType;


export type {
	AppRouter,
	RouterOutputs,
	RouterInputs,
	GameType,
};

export {
	GameTypeObj
}
