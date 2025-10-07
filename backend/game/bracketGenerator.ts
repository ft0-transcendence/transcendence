import { PrismaClient } from "@prisma/client";

export type BracketNode = {
    gameId: string;
    round: number;
    position: number;
    leftPlayerId?: string;
    rightPlayerId?: string;
    nextGameId?: string;
};

export class BracketGenerator {
    private db: PrismaClient;

    constructor(db: PrismaClient) {
        this.db = db;
    }

    /**
     * Genera il bracket completo per un torneo
     * Ordine: P1 vs P2, P3 vs P4, P5 vs P6, P7 vs P8
     */
    async generateBracket(
        tournamentId: string,
        participants: string[],
        tournamentType: 'EIGHT'
    ): Promise<BracketNode[]> {
        const expectedPlayers = 8;

        if (participants.length !== expectedPlayers) {
            throw new Error(`Torneo richiede ${expectedPlayers} giocatori`);
        }

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

                let leftPlayerId: string | undefined;
                let rightPlayerId: string | undefined;

                if (round === 1) {
                    leftPlayerId = participants[position * 2];      // P1, P3, P5, P7
                    rightPlayerId = participants[position * 2 + 1]; // P2, P4, P6, P8
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
     * Crea le partite nel database
     */
    //visto che nextgameid deve avere reference al prossimo game parto a creare dalla finale e vado a ritroso
    async createBracketGames(
        tournamentId: string,
        bracket: BracketNode[]
    ): Promise<void> {
        const sorted = [...bracket].sort((a, b) => b.round - a.round);

        for (const node of sorted) {
            await this.db.game.create({
                data: {
                    id: node.gameId,
                    type: 'TOURNAMENT',
                    startDate: new Date(),
                    scoreGoal: 7,
                    tournamentId,
                    leftPlayerId: node.leftPlayerId || '',
                    rightPlayerId: node.rightPlayerId || '',
                    nextGameId: node.nextGameId,
                    leftPlayerScore: 0,
                    rightPlayerScore: 0
                }
            });
        }
    }

    /**
     * Genera e crea tutto
     */
    async generateAndCreateBracket(
        tournamentId: string,
        participants: string[],
        tournamentType: 'EIGHT'
    ): Promise<BracketNode[]> {
        const bracket = await this.generateBracket(tournamentId, participants, tournamentType);
        await this.createBracketGames(tournamentId, bracket);
        return bracket;
    }

    /**
     * Debug: visualizza bracket
     */
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
}