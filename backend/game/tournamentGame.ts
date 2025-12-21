import { Game as PrismaGame } from "@prisma/client";
import { OnlineGame } from "./onlineGame";
import { GameUserInfo, GameStatus, GameConfig } from "./game";
import { db } from '../src/trpc/db';
import { updateTournamentWinnerStats } from "../src/utils/statsUtils";
import { AIPlayerService } from "../src/services/aiPlayerService";
import { cache } from "../src/cache";
import { TypedSocketNamespace } from "../src/socket-io";
import { checkAndCreateNextRoundInstances } from "../src/trpc/routes/tournament";
import { notifyPlayersAboutNewTournamentGame, tournamentBroadcastBracketUpdateById, tournamentBroadcastTournamentCompleted } from "../src/socket/tournamentSocketNamespace";
import { app } from "../main";
import { skipTournamentAiVsAiGame } from "./bracketGenerator";
import { AiAccuracy, STANDARD_GAME_CONFIG } from "../constants";

type TournamentGameFinishCallback = (state: GameStatus, tournamentId: string, gameId: string) => Promise<void>;

/*
TODOLIST:
- [ ] When a player disconnects, pause the game for a lease time (15s), if he doesn't reconnect, forfeit the game to the other player
- [x] When a score is updated, update the bracket via socket
- [x] When the game ends, advance the winner to the next round and update the tournament bracket
- [ ] If the winner is AI, check if the next round is AI vs AI and autocomplete it if so
*/
export class TournamentGame extends OnlineGame {
	public readonly tournamentId: string;
	private onGameFinish?: TournamentGameFinishCallback;
	private aiIntervals: Map<string, NodeJS.Timeout> = new Map();

	constructor(
		gameId: string,
		tournamentId: string,
		options?: {
			socketNamespace: TypedSocketNamespace | null,
			config?: Partial<GameConfig>,
			onGameFinish?: TournamentGameFinishCallback,
			updateGameActivity?: () => Promise<void>,
		},
		gameDto?: PrismaGame
	) {
		super(gameId, options?.socketNamespace ?? null, options?.config, async (state) => {
			// Handle tournament advancement when game finishes (quello che faceva getMatchresults)
			await this.handleTournamentAdvancement();
		}, options?.updateGameActivity, gameDto);
		this.tournamentId = tournamentId;
		this.onGameFinish = options?.onGameFinish;
	}

	public async finish() {
		if (this.finished) return;
		this.finished = true;

		app.log.warn(`Tournament's (#${this.tournamentId}) Game #${this.gameId} finishing with scores: ${this.scores.left}-${this.scores.right}`);

		for (const interval of this.aiIntervals.values()) {
			clearInterval(interval);
		}
		this.aiIntervals.clear();

		for (const [playerId, interval] of this.warningIntervals) {
			clearInterval(interval);
		}
		this.warningIntervals.clear();

		if (this.unsubscribeTick) {
			this.unsubscribeTick();
			this.unsubscribeTick = null;
		}

		const state = this.getState();
		if (this.socketNamespace) {
			this.socketNamespace.to(this.gameId).emit("game-finished", state);
		}

		if (this.onGameFinish) {
			try {
				app.log.warn(`Tournament's (#${this.tournamentId}) Game #${this.gameId} calling onGameFinish callback`);
				await this.onGameFinish(state, this.tournamentId, this.gameId);
				app.log.warn(`Tournament's (#${this.tournamentId}) Game #${this.gameId} onGameFinish callback completed`);
			} catch (error) {
				app.log.error(`Tournament's (#${this.tournamentId}) Game #${this.gameId} onGameFinish callback failed:`, error);
			}
		}
		await this.handleTournamentAdvancement();
	}

	public async handleTournamentAdvancement() {
		const state = this.getState();
		app.log.info(`handleTournamentAdvancement called for Tournament #${this.tournamentId} Game #${this.gameId} (${state.leftPlayer?.username ?? 'N/A'} vs ${state.rightPlayer?.username ?? 'N/A'})`);
		try {
			const isLeftWinner = this.scores.left > this.scores.right;
			const winnerId = (isLeftWinner ? this.leftPlayer?.id : this.rightPlayer?.id) ?? null;
			const loserId = (isLeftWinner ? this.rightPlayer?.id : this.leftPlayer?.id) ?? null;

			const winnerUsername = isLeftWinner ? this.leftPlayer?.username : this.rightPlayer?.username;
			// const loserUsername = isLeftWinner ? this.rightPlayer?.username : this.leftPlayer?.username;


			if (!winnerId && !loserId) {
				app.log.error(`Tournament's (#${this.tournamentId}) Game #${this.gameId}: No winner/loser determined`);
				return;
			}

			// @unused
			// await updateGameStats(db, winnerId, loserId)

			const currentGame = this.gameDto;
			if (!currentGame) {
				app.log.warn(`handleTournamentAdvancement: currentGame is null`);
				return;
			}

			if (currentGame && currentGame.nextGameId) {
				const nextGame = await db.game.findFirst({
					where: { id: currentGame.nextGameId },
					include: {
						previousGames: { select: { id: true } }
					}
				});

				if (nextGame) {
					const isLeftAI = AIPlayerService.isAIPlayer(nextGame.leftPlayerId, nextGame.leftPlayerUsername);
					const isRightAI = AIPlayerService.isAIPlayer(nextGame.rightPlayerId, nextGame.rightPlayerUsername);
					const isNextSlotLeft = this.gameId === nextGame.previousGames[0].id;


					const commonData = (isLeftAI || isRightAI) ? { startDate: new Date() } : {};


					const data = isNextSlotLeft
						? { leftPlayerId: winnerId, leftPlayerUsername: winnerUsername, ...commonData }
						: { rightPlayerId: winnerId, rightPlayerUsername: winnerUsername, ...commonData };

					await db.game.updateMany({
						where: { id: currentGame.nextGameId },
						data
					});

					if (!winnerId) {
						app.log.info(`handleTournamentAdvancement: AI Won the tournament game #${this.gameId}, trying to advance next possible round of AI vs AI games`);
						await skipTournamentAiVsAiGame(this.tournamentId, nextGame);
					}
					else {
						app.log.info(`handleTournamentAdvancement: User ${winnerId} won the tournament game #${this.gameId} (tournamentId[${this.tournamentId}]). Advancing to next round`);
						await checkAndCreateNextRoundInstances(db, this.tournamentId, currentGame.tournamentRound!);
					}
					tournamentBroadcastBracketUpdateById(this.tournamentId);

				} else {
					app.log.warn(`Tournament's (#${this.tournamentId}) Game #${this.gameId}: No next game found`);
				}
			} else {
				// Torneo completato
				app.log.warn(`Tournament ${this.tournamentId} completed! Winner: ${winnerId}`);

				const t = await db.tournament.update({
					where: { id: this.tournamentId },
					data: {
						endDate: new Date(),
						winnerId: winnerId,
						winnerUsername,
						status: 'COMPLETED'
					}
				});
				console.log({ ttt: t });
				if (!winnerId) {
					app.log.warn(`AI Won the tournament #${this.tournamentId}, no winnerId to update stats for.`);
				} else {
					await updateTournamentWinnerStats(db, winnerId);
				}


				const cachedTournament = cache.tournaments.active.get(this.tournamentId);

				if (cachedTournament) {
					cachedTournament.status = 'COMPLETED';
				}

				tournamentBroadcastTournamentCompleted(this.tournamentId, winnerId, winnerUsername || null);
			}

		} catch (error) {
			app.log.error(`Tournament's (#${this.tournamentId}) Game #${this.gameId} advancement failed:`, error);
		}
	}

	public override playerReady(player: GameUserInfo) {
		super.playerReady(player);

		if (!this.leftPlayer?.isPlayer || !this.rightPlayer?.isPlayer) {
			this.initializeAI();
		}
	}

	private async initializeAI() {
		try {
			if (this.leftPlayer?.isPlayer && this.rightPlayer?.isPlayer) return;

			const isLeftAI = !(this.leftPlayer?.isPlayer ?? false);
			const isRightAI = !(this.rightPlayer?.isPlayer ?? false);

			if (isLeftAI) {
				this.startAI(this.leftPlayer?.id ?? null, 'left');
			}
			if (isRightAI) {
				this.startAI(this.rightPlayer?.id ?? null, 'right');
			}
		} catch (error) {
			app.log.error(`Failed to initialize AI for game #${this.gameId}: %s`, error);
		}
	}

	private startAI(playerId: PrismaGame['leftPlayerId'], side: 'left' | 'right', accuracy: AiAccuracy = AiAccuracy.HIGH) {
		accuracy = Math.max(0, Math.min(1, accuracy));

		app.log.warn(`Starting AI for player ${playerId} on ${side} side in game #${this.gameId}. Accuracy set to ${accuracy}`);

		const aiLogic = () => {
			try {
				const state = this.getState();
				if (state.state !== 'RUNNING') return;

				// reaction delay (frame skipping). needed?
				if (Math.random() > accuracy) { return; }

				const errorRate = 1 - accuracy;
				// 1->0 accuracy value = 0->50% error
				const percentageError = (Math.random() * 2 - 1) * (errorRate * 0.5);


				const aiPaddlePos = side === 'left' ? state.paddles.left : state.paddles.right;

				let target = 50;

				const ballComingTowardsPaddle = side === 'right' ? state.ball.dirX >= 0 : state.ball.dirX <= 0;

				if (ballComingTowardsPaddle) {
					target = state.ball.y;

					target += percentageError;
				}

				const diff = target - aiPaddlePos;
				const deadZone = 5;

				this.release(side, 'up');
				this.release(side, 'down');

				if (Math.abs(diff) > deadZone) {
					// let's make it undecisive
					if (Math.random() > accuracy) {
						return;
					}

					const moveDown = diff > 0;

					// jiggle
					// const shouldActuallyMoveDown = Math.random() < accuracy ? moveDown : !moveDown;
					const shouldActuallyMoveDown = moveDown;

					if (shouldActuallyMoveDown) {
						this.press(side, 'down');
					} else {
						this.press(side, 'up');
					}
				}
			} catch (error) {
				app.log.error(`AI error for player ${playerId}:`, error);
			}
		};

		const interval = setInterval(aiLogic, 1000 / 60);
		this.aiIntervals.set(side, interval);
	}
}


export function createTournamentGameInstance(tournamentId: string, game: PrismaGame) {
	const tournamentNamespace = app.io.of("/tournament");

	const isLeftAI = AIPlayerService.isAIPlayer(game.leftPlayerId, game.leftPlayerUsername);
	const isRightAI = AIPlayerService.isAIPlayer(game.rightPlayerId, game.rightPlayerUsername);

	if (isLeftAI && isRightAI) {
		app.log.warn(`createTournamentGameInstance: provided game is not AI vs AI (leftPlayerId[${game.leftPlayerId}] leftPlayerUsername[${game.leftPlayerUsername}] rightPlayerId[${game.rightPlayerId}] rightPlayerUsername[${game.rightPlayerUsername}])`);
		return null;
	}

	const gameInstance = new TournamentGame(
		game.id,
		tournamentId,
		{
			socketNamespace: tournamentNamespace,
			config: { maxScore: game.scoreGoal || STANDARD_GAME_CONFIG.maxScore },
			onGameFinish:
				async (state: any, _tid: string, gid: string) => {
					const isAborted = gameInstance.wasForfeited;

					app.log.info(`🏁 Tournament Game ${gid} finished - scores: ${state.scores.left}-${state.scores.right}, forfeited: ${isAborted}`);

					await db.game.updateMany({
						where: { id: gid },
						data: {
							endDate: new Date(),
							abortDate: isAborted ? new Date() : null,
							leftPlayerScore: state.scores.left,
							rightPlayerScore: state.scores.right
						}
					});

					cache.tournaments.activeTournamentGames.delete(gid);
					app.log.info(`🗑️ Tournament Game ${gid} removed from cache`);
				},
			updateGameActivity: async () => {
				await db.game.updateMany({
					where: { id: game.id, endDate: null },
					data: { updatedAt: new Date() }
				});
				tournamentBroadcastBracketUpdateById(tournamentId);
			}
		},
		game
	);

	notifyPlayersAboutNewTournamentGame(game.tournamentId, game.id, game.leftPlayerId, game.rightPlayerId);

	gameInstance.setPlayers(
		{ id: game.leftPlayerId, username: game.leftPlayerUsername, isPlayer: !isLeftAI },
		{ id: game.rightPlayerId, username: game.rightPlayerUsername, isPlayer: !isRightAI }
	);


	cache.tournaments.activeTournamentGames.set(game.id, gameInstance);
	return gameInstance;
}
