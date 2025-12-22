import { PrismaClient, TournamentRound, Prisma, Game, Tournament } from "@prisma/client";
import { AIPlayerService } from "../src/services/aiPlayerService";
import { app } from "../main";
import { MapTournamentGamesDTO, mapTournamentGamesToDTO } from "../src/trpc/routes/tournament";
import { db } from "../src/trpc/db";
import { tournamentBroadcastTournamentCompleted } from "../src/socket/tournamentSocketNamespace";
import { CONSTANTS } from "../constants";
import { STANDARD_GAME_CONFIG } from "../constants";


export type BracketNode = {
	gameId: string;
	round: number;
	position: number;
	leftPlayerId?: string | null;
	rightPlayerId?: string | null;
	nextGameId?: string;
	tournamentRound: Game['tournamentRound'];
};

export class BracketGenerator {
	private db: PrismaClient | Prisma.TransactionClient;

	constructor(db: PrismaClient | Prisma.TransactionClient) {
		this.db = db;
	}

	async generateBracket(
		tournamentId: string,
		participants: string[] = []
	): Promise<BracketNode[]> {
		const bracket: BracketNode[] = [];
		const totalRounds = 3;
		const gameIdMap = new Map<string, string>();

		// Genera partite da finale a primo round
		for (let round = totalRounds; round >= 1; round--) {
			const gamesInRound = Math.pow(2, totalRounds - round);

			for (let position = 0; position < gamesInRound; position++) {
				const gameId = crypto.randomUUID();
				gameIdMap.set(`${round}-${position}`, gameId);

				let nextGameId: string | undefined;
				if (round < totalRounds) {
					nextGameId = gameIdMap.get(`${round + 1}-${Math.floor(position / 2)}`);
				}

				let leftPlayerId: string | null = null;
				let rightPlayerId: string | null = null;

				if (round === 1 && participants.length > 0) {
					const leftIndex = position * 2;
					const rightIndex = position * 2 + 1;

					if (leftIndex < participants.length) {
						leftPlayerId = participants[leftIndex];
					}
					if (rightIndex < participants.length) {
						rightPlayerId = participants[rightIndex];
					}
				}

				let tournamentRound: 'QUARTI' | 'SEMIFINALE' | 'FINALE';
				if (round === 3) {
					tournamentRound = 'FINALE';
				} else if (round === 2) {
					tournamentRound = 'SEMIFINALE';
				} else {
					tournamentRound = 'QUARTI';
				}

				bracket.push({
					gameId,
					round,
					position,
					leftPlayerId,
					rightPlayerId,
					nextGameId,
					tournamentRound
				});
			}
		}

		return bracket;
	}

	async createBracketGames(
		tournament: Tournament,
		bracket: BracketNode[]
	): Promise<void> {
		const executeTransaction = async (tx: Prisma.TransactionClient) => {
			const sorted = [...bracket].sort((a, b) => b.round - a.round);

			for (const node of sorted) {
				let tournamentRound: 'QUARTI' | 'SEMIFINALE' | 'FINALE';
				if (node.round === 3) {
					tournamentRound = 'FINALE';
				} else if (node.round === 2) {
					tournamentRound = 'SEMIFINALE';
				} else {
					tournamentRound = 'QUARTI';
				}

				let leftPlayerUsername: string | null = null;
				let leftPlayerId: string | null = null;
				let rightPlayerUsername: string | null = null;
				let rightPlayerId: string | null = null;

				if (node.leftPlayerId) {
					const leftUser = await tx.user.findUnique({
						where: { id: node.leftPlayerId },
						select: { username: true, id: true }
					});
					leftPlayerUsername = leftUser?.username || null;
					leftPlayerId = leftUser?.id || null;
				}

				if (node.rightPlayerId) {
					const rightUser = await tx.user.findUnique({
						where: { id: node.rightPlayerId },
						select: { username: true, id: true }
					});
					rightPlayerUsername = rightUser?.username || null;
					rightPlayerId = rightUser?.id || null;
				}

				app.log.debug(`Creating game #${node.gameId} for tournament #${tournament.id} with round ${tournamentRound} and players ${node?.leftPlayerId ?? 'TBD'} vs ${node?.rightPlayerId ?? 'TBD'}`);

				await tx.game.create({
					data: {
						id: node.gameId,
						type: 'TOURNAMENT',
						tournamentRound: tournamentRound,
						startDate: null,
						scoreGoal: STANDARD_GAME_CONFIG.maxScore!,
						tournamentId: tournament.id,
						leftPlayerId: leftPlayerId,
						rightPlayerId: rightPlayerId,
						leftPlayerUsername: leftPlayerUsername,
						rightPlayerUsername: rightPlayerUsername,
						nextGameId: node.nextGameId,
						leftPlayerScore: 0,
						rightPlayerScore: 0
					}
				});
			}
		};

		if (this.db instanceof PrismaClient) {
			await this.db.$transaction(executeTransaction);
		} else {
			await executeTransaction(this.db);
		}
	}

	async updateGameTypeForAIPlayers(tournamentId: string) {
		const result = await db.game.updateMany({
			where: {
				tournamentId,
				AND: [
					{ leftPlayerId: null, leftPlayerUsername: { not: null } },
					{ rightPlayerId: null, rightPlayerUsername: { not: null } }
				]
			},
			data: {
				type: 'AI'
			}
		});
		app.log.debug(`Updated ${result.count} games to AI type`);
		return result;
	}

	async generateAndCreateBracket(
		tournament: Tournament,
		participants: string[] = []
	): Promise<BracketNode[]> {
		const bracket = await this.generateBracket(tournament.id, participants);
		await this.createBracketGames(tournament, bracket);
		return bracket;
	}

	// Debug:
	printBracket(bracket: BracketNode[]): void {
		const rounds = new Map<number, BracketNode[]>();

		for (const node of bracket) {
			if (!rounds.has(node.round)) rounds.set(node.round, []);
			rounds.get(node.round)!.push(node);
		}

		app.log.debug('\n=== BRACKET ===\n');

		for (const round of Array.from(rounds.keys()).sort()) {
			const games = rounds.get(round)!.sort((a, b) => a.position - b.position);
			app.log.debug(`ROUND ${round}:`);

			for (const game of games) {
				const left = game.leftPlayerId ? `P${game.leftPlayerId.slice(-4)}` : 'TBD';
				const right = game.rightPlayerId ? `P${game.rightPlayerId.slice(-4)}` : 'TBD';
				const roundType = game.tournamentRound ? `[${game.tournamentRound}]` : '';
				const next = game.nextGameId ? ` → Next` : ' [FINALE]';
				app.log.debug(`  Game ${game.position + 1} ${roundType}: ${left} vs ${right}${next}`);
			}
			app.log.debug('');
		}
	}

	getFirstRoundGames(bracket: BracketNode[]): BracketNode[] {
		return bracket.filter(node => node.round === 1);
	}

	getFinalGame(bracket: BracketNode[]): BracketNode | undefined {
		return bracket.find(node => !node.nextGameId);
	}

	async getBracketFromDatabase(tournamentId: string): Promise<BracketNode[]> {
		const games = await this.db.game.findMany({
			where: { tournamentId },
			orderBy: [
				{ startDate: 'asc' },
				{ id: 'asc' }
			]
		});

		const bracket: BracketNode[] = [];
		const gameMap = new Map<string, Game>();

		games.forEach((game) => {
			gameMap.set(game.id, game);
		});

		games.forEach((game) => {
			let round = 1;
			let currentGame: Game | undefined = game;

			while (currentGame.nextGameId) {
				round++;
				currentGame = gameMap.get(currentGame.nextGameId);
				if (!currentGame) break;
			}

			const gamesInRound = games.filter((g) => {
				let r = 1;
				let curr: Game | undefined = g;
				while (curr.nextGameId) {
					r++;
					curr = gameMap.get(curr.nextGameId);
					if (!curr) break;
				}
				return r === round;
			});

			const position = gamesInRound.findIndex((g) => g.id === game.id);

			bracket.push({
				gameId: game.id,
				round,
				position,
				leftPlayerId: game.leftPlayerId || null,
				rightPlayerId: game.rightPlayerId || null,
				nextGameId: game.nextGameId || undefined,
				tournamentRound: game.tournamentRound
			});
		});

		return bracket.sort((a, b) => a.round - b.round || a.position - b.position);
	}

	async getOccupiedSlotsCount(tournamentId: string): Promise<number> {
		const quarterFinalGames = await this.db.game.findMany({
			where: {
				tournamentId,
				tournamentRound: 'QUARTI' as any
			},
			select: {
				leftPlayerId: true,
				rightPlayerId: true
			}
		});

		let occupiedSlots = 0;

		for (const game of quarterFinalGames) {
			if (game.leftPlayerId !== null) {
				occupiedSlots++;
			}
			if (game.rightPlayerId !== null) {
				occupiedSlots++;
			}
		}

		return occupiedSlots;
	}

	async getOccupiedSlots(tournamentId: string): Promise<Map<number, string>> {
		const games = await this.db.game.findMany({
			where: { tournamentId },
			select: {
				id: true,
				leftPlayerId: true,
				rightPlayerId: true,
				tournamentRound: true
			},
			orderBy: [
				{ tournamentRound: 'asc' },
				{ id: 'asc' }
			]
		});

		const slotMap = new Map<number, string>();
		let slotIndex = 0;

		for (const game of games) {
			if (game.leftPlayerId && !this.isEmptySlot(game.leftPlayerId)) {
				slotMap.set(slotIndex, game.leftPlayerId);
			}
			slotIndex++;

			if (game.rightPlayerId && !this.isEmptySlot(game.rightPlayerId)) {
				slotMap.set(slotIndex, game.rightPlayerId);
			}
			slotIndex++;
		}

		return slotMap;
	}

	private isEmptySlot(userId: string | null): boolean {
		return userId === null;
	}

	async assignParticipantToSlot(tournamentId: string, participantId: string): Promise<void> {
		const executeTransaction = async (tx: Prisma.TransactionClient) => {
			const participant = await tx.user.findUnique({
				where: { id: participantId },
				select: { username: true }
			});

			if (!participant) {
				throw new Error(`Participant ${participantId} not found`);
			}

			const quarterFinalGames = await tx.game.findMany({
				where: {
					tournamentId,
					tournamentRound: 'QUARTI'
				},
				select: {
					id: true,
					leftPlayerId: true,
					rightPlayerId: true,
					leftPlayerUsername: true,
					rightPlayerUsername: true
				},
				orderBy: [
					{ startDate: 'asc' },
					{ id: 'asc' }
				]
			});

			const availableSlots: { gameId: string, position: 'left' | 'right' }[] = [];

			app.log.debug('Quarter final games found:', quarterFinalGames.length);

			const isSlotEmpty = (playerId: string | null, username: string | null | undefined): boolean => {
				if (!playerId) return true;

				if (playerId && username === null) return true;

				return false;
			};

			for (const game of quarterFinalGames) {
				if (isSlotEmpty(game.leftPlayerId, game.leftPlayerUsername)) {
					availableSlots.push({ gameId: game.id, position: 'left' as const });
				}
				if (isSlotEmpty(game.rightPlayerId, game.rightPlayerUsername)) {
					availableSlots.push({ gameId: game.id, position: 'right' as const });
				}
			}

			if (availableSlots.length === 0) {
				throw new Error('Nessun slot disponibile nei quarti di finale');
			}

			const randomIndex = Math.floor(Math.random() * availableSlots.length);
			const selectedSlot = availableSlots[randomIndex];

			const updateData = selectedSlot.position === 'left'
				? { leftPlayerId: participantId, leftPlayerUsername: participant.username }
				: { rightPlayerId: participantId, rightPlayerUsername: participant.username };

			await tx.game.update({
				where: { id: selectedSlot.gameId },
				data: updateData
			});
		};

		if (this.db instanceof PrismaClient) {
			await this.db.$transaction(executeTransaction);
		} else {
			await executeTransaction(this.db);
		}
	}

	async removeParticipantFromSlots(tournamentId: string, userId: string): Promise<void> {
		const executeTransaction = async (tx: Prisma.TransactionClient) => {
			const games = await tx.game.findMany({
				where: {
					tournamentId,
					OR: [
						{ leftPlayerId: userId },
						{ rightPlayerId: userId }
					]
				},
				select: {
					id: true,
					leftPlayerId: true,
					rightPlayerId: true
				}
			});

			for (const game of games) {
				const updateData: Partial<Game> = {};

				if (game.leftPlayerId === userId) {
					updateData.leftPlayerId = null;
					updateData.leftPlayerUsername = null;
				}

				if (game.rightPlayerId === userId) {
					updateData.rightPlayerId = null;
					updateData.rightPlayerUsername = null;
				}

				if (Object.keys(updateData).length > 0) {
					await tx.game.update({
						where: { id: game.id },
						data: updateData
					});
				}
			}
		};

		if (this.db instanceof PrismaClient) {
			await this.db.$transaction(executeTransaction);
		} else {
			await executeTransaction(this.db);
		}
	}

	async fillEmptySlotsWithAIAndProgressAutomatically(tournamentId: string) {
		// FILLING QUARTI -> EMPTY SLOTS WITH AI (SETTING USERNAME TO NULL)
		await db.game.updateMany({
			where: {
				tournamentId: tournamentId,
				leftPlayerId: null,
				tournamentRound: TournamentRound.QUARTI,
				endDate: null,
				abortDate: null,
			},
			data: {
				leftPlayerUsername: CONSTANTS.AI_USERNAME,
			}
		});
		await db.game.updateMany({
			where: {
				tournamentId: tournamentId,
				rightPlayerId: null,
				tournamentRound: TournamentRound.QUARTI,
				endDate: null,
				abortDate: null,
			},
			data: {
				rightPlayerUsername: CONSTANTS.AI_USERNAME,
			}
		});

		const {
			allGames,
			sortedGames
		} = await getAllTournamentGames(tournamentId);

		const skipAiVsAiGames = async (games: typeof allGames) => {
			for (const game of games) {
				await skipTournamentAiVsAiGame(tournamentId, game, allGames, sortedGames);
			}
		};

		await skipAiVsAiGames(allGames.filter(g => g.tournamentRound === 'QUARTI'));

		await this.updateGameTypeForAIPlayers(tournamentId);
	}

}

export async function skipNextGameAIVsAI(tournamentId: Tournament['id'], nextGameId: Game['id']) {
	let { allGames, sortedGames } = await getAllTournamentGames(tournamentId);

	const game = allGames.find(g => g.id === nextGameId);
	if (!game) {
		app.log.warn(`skipNextGameAIVsAI: Game #${nextGameId} not found`);
		return;
	}
	const isLeftAi = AIPlayerService.isAIPlayer(game.leftPlayerId, game.leftPlayerUsername);
	const isRightAi = AIPlayerService.isAIPlayer(game.rightPlayerId, game.rightPlayerUsername);

	if (!isLeftAi || !isRightAi) {
		app.log.warn(`skipNextGameAIVsAI: Game #${nextGameId} is not AI vs AI`);
		return;
	}

	await skipTournamentAiVsAiGame(tournamentId, game, allGames, sortedGames);

	const nextGame = allGames.find(g => g.id === game.nextGameId);
	if (nextGame) {
		const isNextGameLeftAi = AIPlayerService.isAIPlayer(nextGame?.leftPlayerId, nextGame?.leftPlayerUsername);
		const isNextGameRightAi = AIPlayerService.isAIPlayer(nextGame?.rightPlayerId, nextGame?.rightPlayerUsername);
		if (isNextGameLeftAi && isNextGameRightAi) {
			await skipNextGameAIVsAI(tournamentId, nextGame.id);
		}
	}
}

const getAllTournamentGames = async (tournamentId: string) => {

	// ALL TOURNAMENT GAMES
	const allGames = await db.game.findMany({
		where: {
			tournamentId,
		},
		orderBy: [
			{ startDate: 'asc' },
			{ id: 'asc' }
		],
		include: {
			leftPlayer: {
				select: {
					id: true,
					username: true
				}
			},
			rightPlayer: {
				select: {
					id: true,
					username: true
				}
			},
			previousGames: {
				select: {
					id: true
				}
			},

		},
	});

	// SORTED GAMES BY ROUND AND POSITION
	const sortedGames = mapTournamentGamesToDTO(allGames);
	return { allGames, sortedGames };
}

export const skipTournamentAiVsAiGame = async (
	tournamentId: string,
	game: {
		id: Game['id'],
		leftPlayerId: Game['leftPlayerId'],
		rightPlayerId: Game['rightPlayerId'],
		leftPlayerUsername: Game['leftPlayerUsername'],
		rightPlayerUsername: Game['rightPlayerUsername'],
		scoreGoal: Game['scoreGoal'],
		nextGameId: Game['nextGameId'],
		startDate: Game['startDate']
	},
	allGames: MapTournamentGamesDTO[] = [],
	sortedGames: ReturnType<typeof mapTournamentGamesToDTO> = []
) => {

	if (!allGames.length || !sortedGames.length) {
		const gamesData = await getAllTournamentGames(tournamentId);
		allGames = gamesData.allGames;
		sortedGames = gamesData.sortedGames;
	}
	const foundGame = allGames.find(g => g.id === game.id);
	if (!foundGame) {
		app.log.warn(`skipNextGameAIVsAI: Game #${game.id} not found`);
		return;
	}

	const isLeftAi = foundGame.leftPlayerId === null && foundGame.leftPlayerUsername !== null;
	const isRightAi = foundGame.rightPlayerId === null && foundGame.rightPlayerUsername !== null;

	if (!isLeftAi || !isRightAi) {
		app.log.warn(`skipNextGameAIVsAI: Game #${foundGame.id} is not AI vs AI (round(${foundGame?.tournamentRound}) leftPlayerId[${foundGame.leftPlayerId}] leftPlayerUsername[${foundGame.leftPlayerUsername}] rightPlayerId[${foundGame.rightPlayerId}] rightPlayerUsername[${foundGame.rightPlayerUsername}])`);
		return;
	}

	app.log.info(`Autocompleting AI vs AI game #${foundGame.id}; leftPlayer[${foundGame.leftPlayerUsername}] rightPlayer[${foundGame.rightPlayerUsername}]`);

	const winner = Math.random() < 0.5 ? 'left' : 'right';
	const leftScore = winner === 'left' ? foundGame.scoreGoal : Math.floor(Math.random() * (foundGame.scoreGoal));
	const rightScore = winner === 'right' ? foundGame.scoreGoal : Math.floor(Math.random() * (foundGame.scoreGoal));


	const updateData: Partial<Game> = {
		leftPlayerScore: leftScore,
		rightPlayerScore: rightScore,
		type: 'AI',
		endDate: new Date(),
		updatedAt: new Date(),
		startDate: foundGame.startDate ?? new Date()
	};

	await db.game.updateMany({
		where: { id: foundGame.id },
		data: updateData
	});

	let updatedGame: Game = foundGame;
	const gameIdx = allGames.findIndex(g => g.id === foundGame.id);
	if (gameIdx !== -1) {
		const prev = allGames[gameIdx];
		allGames[gameIdx] = { ...prev, ...updateData };
		updatedGame = prev;
	}


	const nextGameIdx = foundGame.nextGameId ? allGames.findIndex(g => g.id === foundGame.nextGameId) : -1;
	const nextGame = nextGameIdx !== -1 ? allGames[nextGameIdx] : null;

	if (nextGame) {
		let shouldBePlacedOnLeft = false;
		const [gameBeforeNextOnLeftSide] = sortedGames.filter(g => g.nextGameId === nextGame.id);
		if (gameBeforeNextOnLeftSide?.id === foundGame.id) {
			shouldBePlacedOnLeft = true;
		}
		app.log.debug(`AI vs AI game #${foundGame.id} has next game #${nextGame.id}. Placing the winner on the ${shouldBePlacedOnLeft ? 'left' : 'right'} side`);

		let updatedNextGame: Game;
		if (shouldBePlacedOnLeft) {
			updatedNextGame = await db.game.update({
				where: { id: nextGame.id },
				data: {
					leftPlayerUsername: CONSTANTS.AI_USERNAME,
				}
			});
		} else {
			updatedNextGame = await db.game.update({
				where: { id: nextGame.id },
				data: {
					rightPlayerUsername: CONSTANTS.AI_USERNAME,
				}
			});
		}
		allGames[nextGameIdx] = { ...nextGame, ...updatedNextGame };
		skipTournamentAiVsAiGame(tournamentId, nextGame, allGames, sortedGames);
	} else {
		// FINALE
		const finalGame = updatedGame;
		app.log.info(`skipNextGameAIVsAI: Tournament's FINALE game finished, AI is the winner. (tournamentId[${tournamentId}] gameId[${finalGame.id}])`);

		const winnerId = finalGame.leftPlayerId || finalGame.rightPlayerId;
		const winnerUsername = finalGame.leftPlayerUsername || finalGame.rightPlayerUsername;

		const res = await db.tournament.updateMany({
			where: { id: tournamentId },
			data: {
				endDate: new Date(),
				winnerId,
				winnerUsername,
				status: 'COMPLETED',
			}
		});
		tournamentBroadcastTournamentCompleted(tournamentId, winnerId, winnerUsername);
	}
}
