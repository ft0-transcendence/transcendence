import { Game as PrismaGame } from "@prisma/client";
import { OnlineGame } from "./onlineGame";
import { GameUserInfo, GameStatus, GameConfig } from "./game";
import { db } from '../src/trpc/db';
import { updateTournamentWinnerStats, updateGameStats } from "../src/utils/statsUtils";
import { AIPlayerService } from "../src/services/aiPlayerService";
import { cache } from "../src/cache";
import { TypedSocket, TypedSocketNamespace } from "../src/socket-io";
import { checkAndCreateNextRoundInstances } from "../src/trpc/routes/tournament";
import { tournamentBroadcastTournamentCompleted } from "../src/socket/tournamentSocketNamespace";
import { app } from "../main";
import { skipTournamentAiVsAiGame } from "./bracketGenerator";

type TournamentGameFinishCallback = (state: GameStatus, tournamentId: string, gameId: string) => Promise<void>;

/*
TODOLIST:

- [ ] When a player disconnects, pause the game for a lease time (15s), if he doesn't reconnect, forfeit the game to the other player
- [ ] When a score is updated, update the bracket via socket
- [ ] When the game ends, advance the winner to the next round and update the tournament bracket
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
		}
	) {
		super(gameId, options?.socketNamespace ?? null, options?.config, async (state) => {
			// Handle tournament advancement when game finishes (quello che faceva getMatchresults)
			await this.handleTournamentAdvancement();
		}, options?.updateGameActivity);
		this.tournamentId = tournamentId;
		this.onGameFinish = options?.onGameFinish;
	}

	public override async finish() {
		if (this.finished) return;
		this.finished = true;

		app.log.debug(`Tournament's (#${this.tournamentId}) Game #${this.gameId} finishing with scores: ${this.scores.left}-${this.scores.right}`);

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
				console.log(`Tournament's (#${this.tournamentId}) Game #${this.gameId} calling onGameFinish callback`);
				await this.onGameFinish(state, this.tournamentId, this.gameId);
				console.log(`Tournament's (#${this.tournamentId}) Game #${this.gameId} onGameFinish callback completed`);
			} catch (error) {
				console.error(`Tournament's (#${this.tournamentId}) Game #${this.gameId} onGameFinish callback failed:`, error);
			}
		}
	}

	public async handleTournamentAdvancement() {
		try {
			const isLeftWinner = this.scores.left > this.scores.right;
			const winnerId = (isLeftWinner ? this.leftPlayer?.id : this.rightPlayer?.id) ?? null;
			const loserId = (isLeftWinner ? this.rightPlayer?.id : this.leftPlayer?.id) ?? null;

			const winnerUsername = isLeftWinner ? this.leftPlayer?.username : this.rightPlayer?.username;
			const loserUsername = isLeftWinner ? this.rightPlayer?.username : this.leftPlayer?.username;


			if (!winnerId && !loserId) {
				console.error(`Tournament's (#${this.tournamentId}) Game #${this.gameId}: No winner/loser determined`);
				return;
			}

			// await updateGameStats(db, winnerId, loserId);

			const currentGame = await db.game.findFirst({
				where: { id: this.gameId },
				include: { previousGames: { select: { id: true } } }
			});

			if (currentGame?.nextGameId) {
				const nextGame = await db.game.findFirst({
					where: { id: currentGame.nextGameId },
					include: {
						previousGames: {
							select: {
								id: true
							}
						},
					}
				});

				if (nextGame && nextGame.previousGames.length === 2) {
					const childIds = nextGame.previousGames.map(g => g.id).sort();
					const isLeft = this.gameId === childIds[0];

					const needLastPlayerToStart = AIPlayerService.isAIPlayer(nextGame.leftPlayerId, nextGame.leftPlayerUsername) || AIPlayerService.isAIPlayer(nextGame.rightPlayerId, nextGame.rightPlayerUsername)
						|| !!nextGame.leftPlayerId || !!nextGame.rightPlayerId;

					const commonData = needLastPlayerToStart ? { startDate: new Date() } : {};


					const data = isLeft
						? { leftPlayerId: winnerId, leftPlayerUsername: winnerUsername, ...commonData }
						: { rightPlayerId: winnerId, rightPlayerUsername: winnerUsername, ...commonData };

					await db.game.updateMany({
						where: { id: currentGame.nextGameId },
						data
					});

					if (!winnerId) {
						app.log.debug(`AI Won the tournament game #${this.gameId}, trying to advance next possible round of AI vs AI games`);
						await skipTournamentAiVsAiGame(this.tournamentId, nextGame);
					}

					console.log(`Tournament's (#${this.tournamentId}) Game #${this.gameId}: Winner ${winnerId} advanced to next game #${currentGame.nextGameId}`);
				}

				// Check if we need to create game instances for the next round
				if (currentGame.tournamentRound) {
					await checkAndCreateNextRoundInstances(db, this.tournamentId, currentGame.tournamentRound);
				}
			} else { // Torneo completato
				console.log(`Tournament ${this.tournamentId} completed! Winner: ${winnerId}`);

				await db.tournament.update({
					where: { id: this.tournamentId },
					data: {
						endDate: new Date(),
						winnerId: winnerId,
						winnerUsername,
						status: 'COMPLETED'
					}
				});
				if (!winnerId) {
					app.log.debug(`AI Won the tournament #${this.tournamentId}, no winnerId to update stats for.`);
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
			console.error(`Tournament's (#${this.tournamentId}) Game #${this.gameId} advancement failed:`, error);
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

	private startAI(playerId: PrismaGame['leftPlayerId'], side: 'left' | 'right') {
		console.log(`Starting AI for player ${playerId} on ${side} side in game #${this.gameId}`);

		const aiLogic = () => {
			try {
				const state = this.getState();

				if (state.state !== 'RUNNING') return;

				const aiPaddlePos = side === 'left' ? state.paddles.left : state.paddles.right;
				let target = 50;

				if (side === 'right' && state.ball.dirX >= 0) {
					target = state.ball.y;
				} else if (side === 'left' && state.ball.dirX <= 0) {
					target = state.ball.y;
				}

				const diff = target - aiPaddlePos;
				const deadZone = 5;

				this.release(side, 'up');
				this.release(side, 'down');

				if (Math.abs(diff) > deadZone) {
					if (diff > 0) {
						this.press(side, 'down');
					} else {
						this.press(side, 'up');
					}
				}
			} catch (error) {
				console.error(`AI error for player ${playerId}:`, error);
			}
		};

		const interval = setInterval(aiLogic, 1000 / 60);
		this.aiIntervals.set(side, interval);
	}
}
