import { PrismaClient } from "@prisma/client";
import { AIPlayerService } from "../src/services/aiPlayerService";

export type BracketNode = {
    gameId: string;
    round: number;
    position: number;
    leftPlayerId?: string | null;
    rightPlayerId?: string | null;
    nextGameId?: string;
};

type DatabaseClient = PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export class BracketGenerator {
    private db: DatabaseClient;
    private static PLACEHOLDER_USER_ID = 'placeholder-tournament-user';

    constructor(db: DatabaseClient) {
        this.db = db;
    }

    /**
     * Gets or creates a placeholder user for empty tournament slots
     */
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



    /**
     * Genera il bracket per un torneo
     * Se vengono forniti i partecipanti, li assegna immediatamente
     * Altrimenti crea un bracket vuoto che può essere riempito dinamicamente
     */
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

                // Trova partita successiva
                let nextGameId: string | undefined;
                if (round < totalRounds) {
                    nextGameId = gameIdMap.get(`${round + 1}-${Math.floor(position / 2)}`);
                }

                let leftPlayerId: string | null = null;
                let rightPlayerId: string | null = null;

                // Assegna i partecipanti solo se forniti e se siamo nel primo round
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

                bracket.push({
                    gameId,
                    round,
                    position,
                    leftPlayerId,
                    rightPlayerId,
                    nextGameId
                });
            }
        }

        return bracket;
    }

    /**
     * Crea le partite nel database con supporto per transazioni
     * Visto che nextGameId deve avere reference al prossimo game parto a creare dalla finale e vado a ritroso
     */
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
                try {
                    await tx.game.create({
                        data: {
                            id: node.gameId,
                            type: 'TOURNAMENT',
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
                    console.log(`Created game ${node.gameId} for tournament ${tournamentId}`);
                } catch (error) {
                    console.error(`Failed to create game ${node.gameId}:`, error);
                    throw error;
                }
            }
        };

        if ('$transaction' in this.db) {
            await this.db.$transaction(executeTransaction);
        } else {
            await executeTransaction(this.db);
        }
    }

    /**
     * Updates game type to AI if it has AI players
     */
    async updateGameTypeForAIPlayers(tournamentId: string): Promise<void> {
        const executeTransaction = async (tx: any) => {
            const aiPlayerService = new AIPlayerService(tx);
            
            // Get all games for this tournament
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

                // If at least one player is AI, change game type to AI
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

    /**
     * Genera e crea il bracket completo nel database
     * Può essere chiamato con o senza partecipanti
     */
    async generateAndCreateBracket(
        tournamentId: string,
        participants: string[] = []
    ): Promise<BracketNode[]> {
        const bracket = await this.generateBracket(tournamentId, participants);
        await this.createBracketGames(tournamentId, bracket);
        return bracket;
    }

    
     // Debug: visualizza bracket
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
                const next = game.nextGameId ? ` → Next` : ' [FINALE]';
                console.log(`  Game ${game.position + 1}: ${left} vs ${right}${next}`);
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

    /**
     * Assegna un partecipante al primo slot disponibile nel bracket
     * Cerca prima nei primi round e assegna al primo posto libero
     */
    async assignParticipantToSlot(tournamentId: string, participantId: string): Promise<void> {
        const executeTransaction = async (tx: any) => {
            // Trova tutti i giochi del primo round per questo torneo
            const firstRoundGames = await tx.game.findMany({
                where: {
                    tournamentId,
                    nextGameId: { not: null } // Non è la finale
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

            const nextGameIds = firstRoundGames.map((g: any) => g.nextGameId).filter(Boolean);
            const actualFirstRoundGames = firstRoundGames.filter((game: any) => 
                !nextGameIds.includes(game.id)
            );

            console.log(`DEBUG: Tournament ${tournamentId} - Found ${firstRoundGames.length} total games, ${actualFirstRoundGames.length} first round games`);
            
            // Trova il primo slot disponibile
            for (const game of actualFirstRoundGames) {
                console.log(`DEBUG: Game ${game.id}:`);
                console.log(`  - leftPlayerId: "${game.leftPlayerId}"`);
                console.log(`  - rightPlayerId: "${game.rightPlayerId}"`);
                console.log(`  - leftPlayer email: "${game.leftPlayer?.email}"`);
                console.log(`  - rightPlayer email: "${game.rightPlayer?.email}"`);
                
                // Check if left slot is available (empty string, null, or placeholder user)
                const isLeftSlotEmpty = !game.leftPlayerId || game.leftPlayerId === '' || 
                    (game.leftPlayer && game.leftPlayer.email === 'tournament-empty-slot@system.local');
                
                // Check if right slot is available (empty string, null, or placeholder user)  
                const isRightSlotEmpty = !game.rightPlayerId || game.rightPlayerId === '' ||
                    (game.rightPlayer && game.rightPlayer.email === 'tournament-empty-slot@system.local');
                
                console.log(`  - isLeftSlotEmpty: ${isLeftSlotEmpty}`);
                console.log(`  - isRightSlotEmpty: ${isRightSlotEmpty}`);
                
                if (isLeftSlotEmpty) {
                    console.log(`DEBUG: Assigning participant ${participantId} to left slot of game ${game.id}`);
                    await tx.game.update({
                        where: { id: game.id },
                        data: { leftPlayerId: participantId }
                    });
                    return;
                } else if (isRightSlotEmpty) {
                    console.log(`DEBUG: Assigning participant ${participantId} to right slot of game ${game.id}`);
                    await tx.game.update({
                        where: { id: game.id },
                        data: { rightPlayerId: participantId }
                    });
                    return;
                }
            }

            console.log(`DEBUG: No available slots found in ${actualFirstRoundGames.length} first round games`);
            throw new Error('Nessun slot disponibile nel bracket');
        };

        if ('$transaction' in this.db) {
            await this.db.$transaction(executeTransaction);
        } else {
            await executeTransaction(this.db);
        }
    }

    /**
     * Rimuove un partecipante dal bracket
     * Trova il gioco dove è assegnato e imposta il campo a stringa vuota
     */
    async removeParticipantFromSlot(tournamentId: string, participantId: string): Promise<void> {
        const executeTransaction = async (tx: any) => {
            // Trova il gioco dove il partecipante è assegnato
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

    /**
     * Ottiene lo stato attuale del bracket dal database
     */
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
        
        // Mappa tutti i giochi
        games.forEach(game => {
            gameMap.set(game.id, game);
        });

        // Determina i round basandosi sulla struttura
        games.forEach((game: any) => {
            let round = 1;
            let currentGame = game;
            
            // Conta quanti livelli ci sono fino alla finale
            while (currentGame.nextGameId) {
                round++;
                currentGame = gameMap.get(currentGame.nextGameId);
                if (!currentGame) break;
            }

            // Calcola la posizione nel round
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
                nextGameId: game.nextGameId || undefined
            });
        });

        return bracket.sort((a, b) => a.round - b.round || a.position - b.position);
    }

    /**
     * Conta i slot occupati nel bracket
     */
    async getOccupiedSlotsCount(tournamentId: string): Promise<number> {
        const firstRoundGames = await this.db.game.findMany({
            where: {
                tournamentId,
                nextGameId: { not: null }
            }
        });

        // Filtra per ottenere solo i giochi del primo round
        const nextGameIds = firstRoundGames.map((g: any) => g.nextGameId).filter(Boolean);
        const actualFirstRoundGames = firstRoundGames.filter((game: any) => 
            !nextGameIds.includes(game.id)
        );

        let occupiedSlots = 0;
        for (const game of actualFirstRoundGames) {
            if (game.leftPlayerId && game.leftPlayerId !== '') occupiedSlots++;
            if (game.rightPlayerId && game.rightPlayerId !== '') occupiedSlots++;
        }

        return occupiedSlots;
    }

    /**
     * Gets the occupied slots in the bracket with their positions
     * Returns a Map where key is slot index (0-7) and value is player ID
     */
    async getOccupiedSlots(tournamentId: string): Promise<Map<number, string>> {
        const firstRoundGames = await this.db.game.findMany({
            where: {
                tournamentId,
                nextGameId: { not: null }
            },
            orderBy: [
                { startDate: 'asc' },
                { id: 'asc' }
            ]
        });

        // Filter to get actual first round games
        const nextGameIds = firstRoundGames.map((g: any) => g.nextGameId).filter(Boolean);
        const actualFirstRoundGames = firstRoundGames.filter((game: any) => 
            !nextGameIds.includes(game.id)
        ).sort((a: any, b: any) => a.startDate.getTime() - b.startDate.getTime());

        const occupiedSlots = new Map<number, string>();

        actualFirstRoundGames.forEach((game: any, gameIndex: number) => {
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

    /**
     * Fills empty slots in the tournament bracket with AI players
     * This ensures the tournament has exactly 8 participants when started
     */
    async fillEmptySlotsWithAI(tournamentId: string): Promise<string[]> {
        const executeTransaction = async (tx: any) => {
            const aiPlayerService = new AIPlayerService(tx);
            const createdAIPlayers: string[] = [];

            // Get first round games
            const firstRoundGames = await tx.game.findMany({
                where: {
                    tournamentId,
                    nextGameId: { not: null }
                },
                orderBy: [
                    { startDate: 'asc' },
                    { id: 'asc' }
                ]
            });

            // Filter to get actual first round games
            const nextGameIds = firstRoundGames.map((g: any) => g.nextGameId).filter(Boolean);
            const actualFirstRoundGames = firstRoundGames.filter((game: any) => 
                !nextGameIds.includes(game.id)
            );

            // Fill empty slots with AI players
            for (const game of actualFirstRoundGames) {
                // Check left player slot
                if (!game.leftPlayerId || game.leftPlayerId === '') {
                    const aiPlayerId = await aiPlayerService.createTournamentAIPlayer(tournamentId);
                    await tx.game.update({
                        where: { id: game.id },
                        data: { leftPlayerId: aiPlayerId }
                    });
                    createdAIPlayers.push(aiPlayerId);
                }

                // Check right player slot
                if (!game.rightPlayerId || game.rightPlayerId === '') {
                    const aiPlayerId = await aiPlayerService.createTournamentAIPlayer(tournamentId);
                    await tx.game.update({
                        where: { id: game.id },
                        data: { rightPlayerId: aiPlayerId }
                    });
                    createdAIPlayers.push(aiPlayerId);
                }
            }

            // Update game types for games with AI players
            await this.updateGameTypeForAIPlayers(tournamentId);

            // Process only AI vs AI matches automatically
            // AI vs Human matches should be playable normally using existing AI logic
            for (const game of actualFirstRoundGames) {
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

                // Only handle AI vs AI matches automatically
                // AI vs Human matches will use the existing AI game logic
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