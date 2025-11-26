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

                // Get usernames for players if they exist
                let leftPlayerUsername: string | null = null;
                let rightPlayerUsername: string | null = null;

                if (node.leftPlayerId && node.leftPlayerId !== placeholderUserId) {
                    const leftUser = await tx.user.findUnique({
                        where: { id: node.leftPlayerId },
                        select: { username: true }
                    });
                    leftPlayerUsername = leftUser?.username || null;
                }

                if (node.rightPlayerId && node.rightPlayerId !== placeholderUserId) {
                    const rightUser = await tx.user.findUnique({
                        where: { id: node.rightPlayerId },
                        select: { username: true }
                    });
                    rightPlayerUsername = rightUser?.username || null;
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
                        leftPlayerUsername: leftPlayerUsername,
                        rightPlayerUsername: rightPlayerUsername,
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
                select: {
                    id: true,
                    leftPlayerUsername: true,
                    rightPlayerUsername: true
                }
            });

            for (const game of games) {
                const isLeftAI = aiPlayerService.isAIPlayer(game.leftPlayerUsername);
                const isRightAI = aiPlayerService.isAIPlayer(game.rightPlayerUsername);

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

            const placeholderUserId = await this.ensurePlaceholderUser(tx);
            const availableSlots: { gameId: string, position: 'left' | 'right' }[] = [];

            console.log('Quarter final games found:', quarterFinalGames.length);
            
            const isSlotEmpty = (playerId: string | null, username: string | null | undefined, placeholderId: string): boolean => {
                if (!playerId) return true;
                
                if (playerId === placeholderId) return true;
                
                if (playerId && username === null) return true;
                
                return false;
            };

            for (const game of quarterFinalGames) {
                if (isSlotEmpty(game.leftPlayerId, game.leftPlayerUsername, placeholderUserId)) {
                    availableSlots.push({ gameId: game.id, position: 'left' as const });
                }
                if (isSlotEmpty(game.rightPlayerId, game.rightPlayerUsername, placeholderUserId)) {
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
                    data: { 
                        leftPlayerId: placeholderUserId,
                        leftPlayerUsername: null // Clear username when removing participant
                    }
                });
            }

            if (gameAsRightPlayer) {
                await tx.game.update({
                    where: { id: gameAsRightPlayer.id },
                    data: { 
                        rightPlayerId: placeholderUserId,
                        rightPlayerUsername: null // Clear username when removing participant
                    }
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
            },
            select: {
                leftPlayerUsername: true,
                rightPlayerUsername: true
            }
        });

        let occupiedSlots = 0;
        const placeholderUserId = BracketGenerator.PLACEHOLDER_USER_ID;
        
        for (const game of quarterFinalGames) {
            if (game.leftPlayerUsername !== undefined && game.leftPlayerUsername !== null) {
                occupiedSlots++;
            }
            if (game.rightPlayerUsername !== undefined && game.rightPlayerUsername !== null) {
                occupiedSlots++;
            }
        }

        return occupiedSlots;
    }

    private isPlaceholderUser(userId: string | null): boolean {
        if (!userId) return false;
        return userId === BracketGenerator.PLACEHOLDER_USER_ID || 
               userId === 'placeholder-tournament-user' ||
               userId.includes('placeholder');
    }

    async getOccupiedSlots(tournamentId: string): Promise<Map<number, string>> {
        const games = await this.db.game.findMany({
            where: { 
                tournamentId,
                OR: [
                    { leftPlayerId: { not: null } },
                    { rightPlayerId: { not: null } }
                ]
            },
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
            if (game.leftPlayerId && !this.isPlaceholderUser(game.leftPlayerId)) {
                slotMap.set(slotIndex, game.leftPlayerId);
            }
            slotIndex++;
            
            if (game.rightPlayerId && !this.isPlaceholderUser(game.rightPlayerId)) {
                slotMap.set(slotIndex, game.rightPlayerId);
            }
            slotIndex++;
        }

        return slotMap;
    }

    async removeParticipantFromSlots(tournamentId: string, userId: string): Promise<void> {
        await this.db.game.updateMany({
            where: {
                tournamentId,
                OR: [
                    { leftPlayerId: userId },
                    { rightPlayerId: userId }
                ]
            },
            data: {
                leftPlayerId: this.db.game.fields.leftPlayerId === userId ? null : undefined,
                rightPlayerId: this.db.game.fields.rightPlayerId === userId ? null : undefined
            }
        });
    }

    async fillEmptySlotsWithAI(tournamentId: string): Promise<string[]> {
        const executeTransaction = async (tx: any) => {
            const aiPlayerService = new AIPlayerService(tx);
            const placeholderUserId = await this.ensurePlaceholderUser(tx);
            const aiSlotsFilled: string[] = [];

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
                let updateData: any = {};

                if (!game.leftPlayerId || game.leftPlayerId === '' || 
                    game.leftPlayerId === placeholderUserId || 
                    game.leftPlayerUsername === undefined) {
                    updateData.leftPlayerUsername = null; // Set to null for AI
                    aiSlotsFilled.push(`${game.id}-left`);
                }

                if (!game.rightPlayerId || game.rightPlayerId === '' || 
                    game.rightPlayerId === placeholderUserId || 
                    game.rightPlayerUsername === undefined) {
                    updateData.rightPlayerUsername = null; // Set to null for AI
                    aiSlotsFilled.push(`${game.id}-right`);
                }

                if (Object.keys(updateData).length > 0) {
                    await tx.game.update({
                        where: { id: game.id },
                        data: updateData
                    });
                }
            }

            await this.updateGameTypeForAIPlayers(tournamentId);

            // Process all AI vs AI matches automatically using new username system
            const allTournamentGames = await tx.game.findMany({
                where: {
                    tournamentId,
                    endDate: null // Only unfinished games
                },
                select: {
                    id: true,
                    tournamentRound: true,
                    leftPlayerUsername: true,
                    rightPlayerUsername: true
                },
                orderBy: [
                    { startDate: 'asc' },
                    { id: 'asc' }
                ]
            });

            for (const game of allTournamentGames) {
                const isLeftAI = aiPlayerService.isAIPlayer(game.leftPlayerUsername);
                const isRightAI = aiPlayerService.isAIPlayer(game.rightPlayerUsername);

                if (isLeftAI && isRightAI) {
                    console.log(`🤖 Processing AI vs AI match: ${game.id} (${game.tournamentRound})`);
                    await aiPlayerService.handleAIvsAIMatch(game.id);
                }
            }

            return aiSlotsFilled;
        };

        if ('$transaction' in this.db) {
            return await this.db.$transaction(executeTransaction);
        } else {
            return await executeTransaction(this.db);
        }
    }
}