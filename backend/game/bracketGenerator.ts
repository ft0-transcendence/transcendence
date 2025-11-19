import { PrismaClient, TournamentRound } from "@prisma/client";
import { AIPlayerService } from "../src/services/aiPlayerService";

export type BracketNode = {
    gameId: string;
    round: number;
    position: number;
    leftPlayerId?: string | null;
    rightPlayerId?: string | null;
    nextGameId?: string;
    tournamentRound?: 'QUARTI' | 'SEMIFINALE' | 'FINALE';
};

export class BracketGenerator {
    private db: PrismaClient | any;
    private static PLACEHOLDER_USER_ID = 'placeholder-tournament-user';

    constructor(db: PrismaClient | any) {
        this.db = db;
    }

    private async getPlaceholderUserId(dbClient?: any): Promise<string> {
        const placeholderEmail = 'tournament-empty-slot@system.local';
        const client = dbClient || this.db;
        
        let user = await client.user.findUnique({
            where: { email: placeholderEmail }
        });

        if (!user) {
            user = await client.user.create({
                data: {
                    email: placeholderEmail,
                    username: 'Empty Slot',
                    preferredLanguage: 'en'
                }
            });
        }

        return user.id;
    }

    private async ensurePlaceholderUser(tx: any): Promise<string> {
        try {
            let user = await tx.user.findUnique({
                where: { id: BracketGenerator.PLACEHOLDER_USER_ID }
            });
            
            if (!user) {
                user = await tx.user.create({
                    data: {
                        id: BracketGenerator.PLACEHOLDER_USER_ID,
                        email: 'placeholder@tournament.system',
                        username: 'Tournament Placeholder',
                        preferredLanguage: 'en'
                    }
                });
            }
            
            return user.id;
        } catch (error) {
            // If user already exists, just return the ID
            return BracketGenerator.PLACEHOLDER_USER_ID;
        }
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

                // Determina il round del torneo basandosi sul round del bracket
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

     // Crea le partite nel database con supporto per transazioni
    async createBracketGames(
        tournamentId: string,
        bracket: BracketNode[]
    ): Promise<void> {
        const executeTransaction = async (tx: any) => {
            // Create placeholder user only once per transaction
            let placeholderUserId: string;
            try {
                const placeholderEmail = 'tournament-empty-slot@system.local';
                let user = await tx.user.findUnique({
                    where: { email: placeholderEmail }
                });
                if (!user) {
                    user = await tx.user.create({
                        data: {
                            email: placeholderEmail,
                            username: 'Empty Slot',
                            preferredLanguage: 'en'
                        }
                    });
                }
                placeholderUserId = user.id;
            } catch (error) {
                console.error('Failed to create placeholder user:', error);
                throw error;
            }

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

                await tx.game.create({
                    data: {
                        id: node.gameId,
                        type: 'TOURNAMENT',
                        tournamentRound: tournamentRound,
                        startDate: new Date(),
                        scoreGoal: 7,
                        tournamentId,
                        leftPlayerId: node.leftPlayerId || placeholderUserId,
                        rightPlayerId: node.rightPlayerId || placeholderUserId,
                        nextGameId: node.nextGameId,
                        leftPlayerScore: 0,
                        rightPlayerScore: 0
                    }
                });
            }
        };

        if ('$transaction' in this.db) {
            await this.db.$transaction(executeTransaction);
        } else {
            await executeTransaction(this.db);
        }
    }

    //AI game
    async updateGameTypeForAIPlayers(tournamentId: string): Promise<void> {
        const executeTransaction = async (tx: any) => {
            const aiPlayerService = new AIPlayerService(tx);
            
            const games = await tx.game.findMany({
                where: { tournamentId },
                include: {
                    leftPlayer: true,
                    rightPlayer: true
                }
            });

            for (const game of games) {
                if (!game.leftPlayer || !game.rightPlayer) continue;

                const isLeftAI = aiPlayerService.isAIPlayer(game.leftPlayer.email);
                const isRightAI = aiPlayerService.isAIPlayer(game.rightPlayer.email);

                if (isLeftAI || isRightAI) {
                    await tx.game.update({
                        where: { id: game.id },
                        data: { type: 'AI' }
                    });
                    console.log(`Game ${game.id} updated to AI type (left: ${isLeftAI}, right: ${isRightAI})`);
                }
            }
        };

        if ('$transaction' in this.db) {
            await this.db.$transaction(executeTransaction);
        } else {
            await executeTransaction(this.db);
        }
    }

    async generateAndCreateBracket(
        tournamentId: string,
        participants: string[] = []
    ): Promise<BracketNode[]> {
        const bracket = await this.generateBracket(tournamentId, participants);
        await this.createBracketGames(tournamentId, bracket);
        return bracket;
    }



    
     // Debug:
    printBracket(bracket: BracketNode[]): void {
        const rounds = new Map<number, BracketNode[]>();

        for (const node of bracket) {
            if (!rounds.has(node.round)) rounds.set(node.round, []);
            rounds.get(node.round)!.push(node);
        }

        console.log('\n=== BRACKET ===\n');

        for (const round of Array.from(rounds.keys()).sort()) {
            const games = rounds.get(round)!.sort((a, b) => a.position - b.position);
            console.log(`ROUND ${round}:`);

            for (const game of games) {
                const left = game.leftPlayerId ? `P${game.leftPlayerId.slice(-4)}` : 'TBD';
                const right = game.rightPlayerId ? `P${game.rightPlayerId.slice(-4)}` : 'TBD';
                const roundType = game.tournamentRound ? `[${game.tournamentRound}]` : '';
                const next = game.nextGameId ? ` → Next` : ' [FINALE]';
                console.log(`  Game ${game.position + 1} ${roundType}: ${left} vs ${right}${next}`);
            }
            console.log('');
        }
    }

    getFirstRoundGames(bracket: BracketNode[]): BracketNode[] {
        return bracket.filter(node => node.round === 1);
    }

    getFinalGame(bracket: BracketNode[]): BracketNode | undefined {
        return bracket.find(node => !node.nextGameId);
    }

    async assignParticipantToSlot(tournamentId: string, participantId: string): Promise<void> {
        const executeTransaction = async (tx: any) => {
            const quarterFinalGames = await tx.game.findMany({
                where: {
                    tournamentId,
                    tournamentRound: 'QUARTI'
                },
                include: {
                    leftPlayer: { select: { email: true } },
                    rightPlayer: { select: { email: true } }
                },
                orderBy: [
                    { startDate: 'asc' },
                    { id: 'asc' }
                ]
            });

            const availableSlots: { gameId: string, position: 'left' | 'right' }[] = [];
            
            for (const game of quarterFinalGames) {
                const isLeftSlotEmpty = !game.leftPlayerId || game.leftPlayerId === '' || 
                    (game.leftPlayer && game.leftPlayer.email === 'tournament-empty-slot@system.local');
                
                const isRightSlotEmpty = !game.rightPlayerId || game.rightPlayerId === '' ||
                    (game.rightPlayer && game.rightPlayer.email === 'tournament-empty-slot@system.local');
                
                if (isLeftSlotEmpty) {
                    availableSlots.push({ gameId: game.id, position: 'left' });
                }
                if (isRightSlotEmpty) {
                    availableSlots.push({ gameId: game.id, position: 'right' });
                }
            }

            if (availableSlots.length === 0) {
                throw new Error('Nessun slot disponibile nei quarti di finale');
            }

            // Assegna casualmente uno slot disponibile tra i quarti di finale
            const randomIndex = Math.floor(Math.random() * availableSlots.length);
            const selectedSlot = availableSlots[randomIndex];

            const updateData = selectedSlot.position === 'left' 
                ? { leftPlayerId: participantId }
                : { rightPlayerId: participantId };

            await tx.game.update({
                where: { id: selectedSlot.gameId },
                data: updateData
            });
        };

        if ('$transaction' in this.db) {
            await this.db.$transaction(executeTransaction);
        } else {
            await executeTransaction(this.db);
        }
    }

    async removeParticipantFromSlot(tournamentId: string, participantId: string): Promise<void> {
        const executeTransaction = async (tx: any) => {
            const gameAsLeftPlayer = await tx.game.findFirst({
                where: {
                    tournamentId,
                    leftPlayerId: participantId
                }
            });

            const gameAsRightPlayer = await tx.game.findFirst({
                where: {
                    tournamentId,
                    rightPlayerId: participantId
                }
            });

            const placeholderUserId = await this.ensurePlaceholderUser(tx);
            
            if (gameAsLeftPlayer) {
                await tx.game.update({
                    where: { id: gameAsLeftPlayer.id },
                    data: { leftPlayerId: placeholderUserId }
                });
            }

            if (gameAsRightPlayer) {
                await tx.game.update({
                    where: { id: gameAsRightPlayer.id },
                    data: { rightPlayerId: placeholderUserId }
                });
            }

            if (!gameAsLeftPlayer && !gameAsRightPlayer) {
                throw new Error('Partecipante non trovato nel bracket');
            }
        };

        if ('$transaction' in this.db) {
            await this.db.$transaction(executeTransaction);
        } else {
            await executeTransaction(this.db);
        }
    }



    async getBracketFromDatabase(tournamentId: string): Promise<BracketNode[]> {
        const games = await this.db.game.findMany({
            where: { tournamentId },
            orderBy: [
                { startDate: 'asc' },
                { id: 'asc' }
            ]
        });

        // Converti i giochi del database in BracketNode
        // Determina il round basandosi sulla struttura del bracket
        const bracket: BracketNode[] = [];
        const gameMap = new Map<string, any>();
        
        games.forEach((game: any) => {
            gameMap.set(game.id, game);
        });

        games.forEach((game: any) => {
            let round = 1;
            let currentGame = game;
            
            while (currentGame.nextGameId) {
                round++;
                currentGame = gameMap.get(currentGame.nextGameId);
                if (!currentGame) break;
            }

            const gamesInRound = games.filter((g: any) => {
                let r = 1;
                let curr = g;
                while (curr.nextGameId) {
                    r++;
                    curr = gameMap.get(curr.nextGameId);
                    if (!curr) break;
                }
                return r === round;
            });

            const position = gamesInRound.findIndex((g: any) => g.id === game.id);

            bracket.push({
                gameId: game.id,
                round,
                position,
                leftPlayerId: game.leftPlayerId || null,
                rightPlayerId: game.rightPlayerId || null,
                nextGameId: game.nextGameId || undefined,
                tournamentRound: game.tournamentRound as 'QUARTI' | 'SEMIFINALE' | 'FINALE' | undefined
            });
        });

        return bracket.sort((a, b) => a.round - b.round || a.position - b.position);
    }

    async getOccupiedSlotsCount(tournamentId: string): Promise<number> {
        const quarterFinalGames = await this.db.game.findMany({
            where: {
                tournamentId,
                tournamentRound: 'QUARTI' as any
            }
        });

        let occupiedSlots = 0;
        for (const game of quarterFinalGames) {
            if (game.leftPlayerId && game.leftPlayerId !== '') occupiedSlots++;
            if (game.rightPlayerId && game.rightPlayerId !== '') occupiedSlots++;
        }

        return occupiedSlots;
    }

    async getOccupiedSlots(tournamentId: string): Promise<Map<number, string>> {
        const quarterFinalGames = await this.db.game.findMany({
            where: {
                tournamentId,
                tournamentRound: 'QUARTI' as any // Filtra solo per partite dei quarti di finale
            },
            orderBy: [
                { startDate: 'asc' },
                { id: 'asc' }
            ]
        });

        const occupiedSlots = new Map<number, string>();

        quarterFinalGames.forEach((game: any, gameIndex: number) => {
            const leftSlotIndex = gameIndex * 2;
            const rightSlotIndex = gameIndex * 2 + 1;

            if (game.leftPlayerId && game.leftPlayerId !== '') {
                occupiedSlots.set(leftSlotIndex, game.leftPlayerId);
            }
            if (game.rightPlayerId && game.rightPlayerId !== '') {
                occupiedSlots.set(rightSlotIndex, game.rightPlayerId);
            }
        });

        return occupiedSlots;
    }

    async fillEmptySlotsWithAI(tournamentId: string): Promise<string[]> {
        const executeTransaction = async (tx: any) => {
            const aiPlayerService = new AIPlayerService(tx);
            const createdAIPlayers: string[] = [];

            const quarterFinalGames = await tx.game.findMany({
                where: {
                    tournamentId,
                    tournamentRound: 'QUARTI' // Filtra solo per partite dei quarti di finale
                },
                orderBy: [
                    { startDate: 'asc' },
                    { id: 'asc' }
                ]
            });

            for (const game of quarterFinalGames) {
                if (!game.leftPlayerId || game.leftPlayerId === '') {
                    const aiPlayerId = await aiPlayerService.createTournamentAIPlayer(tournamentId);
                    await tx.game.update({
                        where: { id: game.id },
                        data: { leftPlayerId: aiPlayerId }
                    });
                    createdAIPlayers.push(aiPlayerId);
                }

                if (!game.rightPlayerId || game.rightPlayerId === '') {
                    const aiPlayerId = await aiPlayerService.createTournamentAIPlayer(tournamentId);
                    await tx.game.update({
                        where: { id: game.id },
                        data: { rightPlayerId: aiPlayerId }
                    });
                    createdAIPlayers.push(aiPlayerId);
                }
            }

            await this.updateGameTypeForAIPlayers(tournamentId);

            // Process only AI vs AI matches automatically
            for (const game of quarterFinalGames) {
                const updatedGame = await tx.game.findUnique({
                    where: { id: game.id },
                    include: {
                        leftPlayer: true,
                        rightPlayer: true
                    }
                });

                if (!updatedGame) continue;

                const isLeftAI = aiPlayerService.isAIPlayer(updatedGame.leftPlayer.email);
                const isRightAI = aiPlayerService.isAIPlayer(updatedGame.rightPlayer.email);

                if (isLeftAI && isRightAI) {
                    await aiPlayerService.handleAIvsAIMatch(game.id);
                }
            }

            return createdAIPlayers;
        };

        if ('$transaction' in this.db) {
            return await this.db.$transaction(executeTransaction);
        } else {
            return await executeTransaction(this.db);
        }
    }
}