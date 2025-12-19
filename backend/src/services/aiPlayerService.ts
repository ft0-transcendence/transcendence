import { STANDARD_GAME_CONFIG } from "../../shared_exports";
import { Game, Prisma, PrismaClient } from "@prisma/client";
import { checkAndCreateNextRoundInstances } from "../trpc/routes/tournament";
import { app } from "../../main";
import { tournamentBroadcastBracketUpdateById } from "../socket/tournamentSocketNamespace";
import { db } from "../trpc/db";

export class AIPlayerService {
	private db: PrismaClient | Prisma.TransactionClient;

	constructor(db: PrismaClient | Prisma.TransactionClient) {
		this.db = db;
	}

	async assignAIPlayerToGame(gameId: string, position: 'left' | 'right'): Promise<void> {
		const updateData = position === 'left'
			? { leftPlayerUsername: null }
			: { rightPlayerUsername: null };

		await this.db.game.update({
			where: { id: gameId },
			data: updateData
		});
	}

	async handleAIvsAIMatch(gameId: string) {
		app.log.debug(`🤖 Starting AI vs AI simulation for game ${gameId}`);

		// Avvia simulazione con Promise
		return new Promise<void>((resolve, reject) => {
			let leftScore = 0;
			let rightScore = 0;
			const maxScore = STANDARD_GAME_CONFIG.maxScore || 5;

			app.log.debug(`🎮 AI Match ${gameId} - Target score: ${maxScore}`);

			// Ogni 5 secondi un AI casuale segna

			const simulateTick = async () => {
				try {
					const leftScores = Math.random() > 0.5;

					if (leftScores) {
						leftScore++;
						app.log.debug(`🎯 Game ${gameId} - Left AI scored! Score: ${leftScore}-${rightScore}`);
					} else {
						rightScore++;
						app.log.debug(`🎯 Game ${gameId} - Right AI scored! Score: ${leftScore}-${rightScore}`);
					}

					if (leftScore >= maxScore || rightScore >= maxScore) {
						app.log.debug(`✅ AI Match ${gameId} completed: ${leftScore}-${rightScore}`);

						await this.saveAIMatchResult(gameId, leftScore, rightScore);

						resolve();
						return;
					} else {
						await db.$transaction(async (tx) => {
							const game = await tx.game.update({
								where: { id: gameId },
								data: {
									leftPlayerScore: leftScore,
									rightPlayerScore: rightScore
								}
							});
							if (game.tournamentId) {
								tournamentBroadcastBracketUpdateById(game.tournamentId)
							}
						});
					}
					setTimeout(simulateTick, 5000);
				} catch (error) {
					app.log.error(`❌ Error during AI match simulation for game ${gameId}: %s`, error);
					reject(error);
				}
			}
			simulateTick();
		});
	}

	private async saveAIMatchResult(gameId: string, leftScore: number, rightScore: number) {
		let game = await db.game.update({
			where: { id: gameId },
			data: {
				leftPlayerScore: leftScore,
				rightPlayerScore: rightScore,
				endDate: new Date()
			},
			select: {
				tournamentId: true,
				tournamentRound: true,
				nextGameId: true,
				id: true
			}
		});

		if (!game) {
			app.log.debug(`❌ Game ${gameId} not found when saving result`);
			return;
		}

		if (game.nextGameId) {
			const nextGameId = game.nextGameId;
			app.log.debug(`➡️ Advancing AI winner to next game ${nextGameId}`);
			const nextGame = await db.$transaction(async (tx) => {
				return await db.game.findFirst({
					where: { id: nextGameId },
					include: {
						leftPlayer: true,
						rightPlayer: true
					}
				});
			});
			if (!nextGame) {
				app.log.debug(`❌ Next game ${nextGameId} not found when advancing AI winner`);
				return;
			}

			const leftPlayer = nextGame.leftPlayer;
			const rightPlayer = nextGame.rightPlayer;

			let leftPlayerIsAI = nextGame.leftPlayerUsername === null;
			let rightPlayerIsAI = nextGame.rightPlayerUsername === null;

			const leftPlayerSlotIsEmpty = leftPlayer.id === null && !leftPlayerIsAI;
			const rightPlayerSlotIsEmpty = rightPlayer.id === null && !rightPlayerIsAI;

			const freeSlotsLeft = (leftPlayerSlotIsEmpty ? 1 : 0) + (rightPlayerSlotIsEmpty ? 1 : 0);

			if (freeSlotsLeft < 1) {
				app.log.debug(`❌ Next game ${nextGameId} is somehow already made. Skipping advancing AI winner`);
				return;
			}

			const slotToUpdate = leftPlayerSlotIsEmpty ? 'left' : 'right';
			if (slotToUpdate === 'left') {
				leftPlayerIsAI = true;
			} else {
				rightPlayerIsAI = true;
			}

			app.log.debug(`➡️ Advancing AI winner to next game ${nextGameId} by filling ${slotToUpdate} slot`);

			let updateData: Partial<Game> = {};

			const nextGameBecameAIvsAI = leftPlayerIsAI && rightPlayerIsAI;

			if (nextGameBecameAIvsAI) {
				updateData.type = 'AI';
			}
			if (slotToUpdate === 'left') {
				updateData.leftPlayerUsername = null;
			} else {
				updateData.rightPlayerUsername = null;
			}

			await db.$transaction(async (tx) => {
				game = await db.game.update({
					where: { id: nextGameId },
					data: updateData
				});
			});


			if (nextGameBecameAIvsAI) {
				app.log.debug(`🎮 Next game ${nextGameId} is now AI vs AI, starting simulation`);
				setTimeout(() => {
					this.handleAIvsAIMatch(nextGameId)
						.catch((error) => {
							app.log.debug(`❌ Failed to start AI vs AI simulation for game ${nextGameId}:`, error);
						});
				}, 100);
			}
		}

		app.log.debug(`✅ AI match ${gameId} saved successfully`);

		if (game?.tournamentId && game?.tournamentRound) {
			await checkAndCreateNextRoundInstances(db, game.tournamentId, game.tournamentRound);
		}
	}

	isAIPlayer(username: string | null): boolean {
		return username === null;
	}
	public static isAIPlayer(username: string | null): boolean {
		return username === null;
	}

	async getTournamentAIGames(tournamentId: string): Promise<string[]> {
		const aiGames = await this.db.game.findMany({
			where: {
				tournamentId: tournamentId,
				OR: [
					{ leftPlayerUsername: null },
					{ rightPlayerUsername: null }
				]
			},
			select: { id: true }
		});

		return aiGames.map((game) => game.id);
	}



	async isAIvsAIGame(gameId: string): Promise<boolean> {
		const game = await this.db.game.findUnique({
			where: { id: gameId },
			select: {
				leftPlayerUsername: true,
				rightPlayerUsername: true
			}
		});

		if (!game) {
			return false;
		}

		return this.isAIPlayer(game.leftPlayerUsername) && this.isAIPlayer(game.rightPlayerUsername);
	}

	async hasAIPlayer(gameId: string): Promise<boolean> {
		const game = await this.db.game.findUnique({
			where: { id: gameId },
			select: {
				leftPlayerUsername: true,
				rightPlayerUsername: true
			}
		});

		if (!game) {
			return false;
		}

		return this.isAIPlayer(game.leftPlayerUsername) || this.isAIPlayer(game.rightPlayerUsername);
	}
}
