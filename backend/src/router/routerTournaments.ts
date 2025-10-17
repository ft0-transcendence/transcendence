import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TRPCError } from "@trpc/server";
import { TournamentType, TournamentStatus, User } from "@prisma/client";
import { db } from '../trpc/db';

//middleware, usato in tutte le routes per verificare se l'utente è autenticato
async function authenticate(request: any, reply: FastifyReply) {
    try {
        if (!request.session || !request.session.passport) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        const user = await db.user.findFirst({ 
            where: { id: request.session.passport } 
        });

        if (!user) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }
        //add user to request per usare i suoi dati nelle routes
        request.user = user;
    } catch (error) {
        return reply.status(401).send({ error: 'Unauthorized' });
    }
}

export async function tournamentRoutes(fastify: FastifyInstance) {
    // /api/tournaments - Create tournament
    fastify.post('/api/tournaments', {
        preHandler: [authenticate]
    }, async (request, reply) => {
        try {
            const { name, type, password, startDate } = request.body as {
                name: string;
                type: TournamentType;
                password?: string;
                startDate?: string;
            };

            // Validation
            if (!name || name.length < 3 || name.length > 50) {
                return reply.status(400).send({ error: 'Name must be between 3 and 50 characters' });
            }

            if (!type || !Object.values(TournamentType).includes(type)) {
                return reply.status(400).send({ error: 'Invalid tournament type' });
            }

            const tournament = await db.tournament.create({
                data: {
                    name,
                    type,
                    password,
                    startDate: startDate ? new Date(startDate) : new Date(),
                    createdById: request.user!.id,
                },
                include: {
                    createdBy: {
                        select: {
                            id: true,
                            username: true
                        }
                    },
                    participants: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    username: true
                                }
                            }
                        }
                    }
                }
            });

            // Creator joins tournament automatically
            await db.tournamentParticipant.create({
                data: {
                    tournamentId: tournament.id,
                    userId: request.user!.id
                }
            });

            return reply.status(201).send(tournament);
        } catch (error) {
            fastify.log.error('Error creating tournament:', error);
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    // /api/tournaments/:id/join - Join tournament
    fastify.post('/api/tournaments/:id/join', {
        preHandler: [authenticate]
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const { password } = request.body as { password?: string };

            const tournament = await db.tournament.findUnique({
                where: { id },
                include: {
                    participants: true
                }
            });

            if (!tournament) {
                return reply.status(404).send({ error: 'Tournament not found' });
            }

            // Check password if required
            if (tournament.password && tournament.password !== password) {
                return reply.status(401).send({ error: 'Invalid password' });
            }

            // Check if user is already in tournament
            const alreadyJoined = tournament.participants.some(p => p.userId === request.user!.id);
            if (alreadyJoined) {
                return reply.status(400).send({ error: 'Already joined this tournament' });
            }

            // Check if tournament is full
            const maxParticipants = 8;
            if (tournament.participants.length >= maxParticipants) {
                return reply.status(400).send({ error: 'Tournament is full' });
            }

            // Add participant
            const participant = await db.tournamentParticipant.create({
                data: {
                    tournamentId: id,
                    userId: request.user!.id
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true
                        }
                    }
                }
            });

            return reply.status(200).send(participant);
        } catch (error) {
            fastify.log.error('Error joining tournament:', error);
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    // /api/tournaments/:id/leave - Leave tournament
    fastify.delete('/api/tournaments/:id/leave', {
        preHandler: [authenticate]
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };

            const tournament = await db.tournament.findUnique({
                where: { id },
                include: {
                    participants: true,
                    games: true
                }
            });

            if (!tournament) {
                return reply.status(404).send({ error: 'Tournament not found' });
            }

            if (tournament.status !== 'WAITING_PLAYERS') {
                return reply.status(400).send({ error: 'Cannot leave tournament that has already started' });
            }

            const participant = await db.tournamentParticipant.findFirst({
                where: {
                    tournamentId: id,
                    userId: request.user!.id
                }
            });

            if (!participant) {
                return reply.status(400).send({ error: 'You are not a participant in this tournament' });
            }

            await db.tournamentParticipant.delete({
                where: { id: participant.id }
            });

            return reply.status(200).send({ success: true });
        } catch (error) {
            fastify.log.error('Error leaving tournament:', error);
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    // /api/tournaments/:id/start - Start tournament
    fastify.post('/api/tournaments/:id/start', {
        preHandler: [authenticate]
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };

            const tournament = await db.tournament.findUnique({
                where: { id },
                include: {
                    participants: {
                        include: { user: true }
                    },
                    games: true
                }
            });

            if (!tournament) {
                return reply.status(404).send({ error: 'Tournament not found' });
            }

            if (tournament.createdById !== request.user!.id) {
                return reply.status(403).send({ error: 'Only the tournament creator can start the tournament' });
            }

            if (tournament.games.length > 0) {
                return reply.status(400).send({ error: 'Tournament already started' });
            }

            const maxParticipants = 8;
            if (tournament.participants.length < maxParticipants) {
                return reply.status(400).send({ error: 'Tournament is not full' });
            }

            // Update tournament status
            await db.tournament.update({
                where: { id },
                data: { status: 'IN_PROGRESS' }
            });

            // Create tournament bracket
            const participantIds = tournament.participants.map(p => p.userId);
            const roundsCount = Math.log2(tournament.participants.length);
            let parentRoundGameIds: string[] = [];

            // Create final game
            const finalGame = await db.game.create({
                data: {
                    type: 'TOURNAMENT',
                    startDate: new Date(),
                    tournamentId: tournament.id,
                    leftPlayerId: participantIds[0],
                    rightPlayerId: participantIds[1],
                    scoreGoal: 7
                },
                select: { id: true }
            });

            parentRoundGameIds = [finalGame.id];

            // Create rounds 
            for (let r = roundsCount - 2; r >= 0; r--) {
                const gamesInRound = 2 ** r;
                const newRoundIds: string[] = [];

                for (let gi = 0; gi < gamesInRound; gi++) {
                    const nextGameId = parentRoundGameIds[Math.floor(gi / 2)];

                    let leftPlayerId: string;
                    let rightPlayerId: string;

                    if (r === 0) {
                        const pairIndex = gi * 2;
                        leftPlayerId = participantIds[pairIndex];
                        rightPlayerId = participantIds[pairIndex + 1];
                    } else {
                        leftPlayerId = participantIds[0];
                        rightPlayerId = participantIds[1];
                    }

                    const created = await db.game.create({
                        data: {
                            type: 'TOURNAMENT',
                            startDate: new Date(),
                            tournamentId: tournament.id,
                            leftPlayerId,
                            rightPlayerId,
                            nextGameId,
                            scoreGoal: 7
                        },
                        select: { id: true }
                    });
                    newRoundIds.push(created.id);
                }

                parentRoundGameIds = newRoundIds;
            }

            const updatedTournament = await db.tournament.findUnique({
                where: { id },
                include: {
                    participants: {
                        include: { user: true }
                    },
                    games: {
                        include: { leftPlayer: true, rightPlayer: true },
                        orderBy: { startDate: 'asc' }
                    }
                }
            });

            return reply.status(200).send(updatedTournament);
        } catch (error) {
            fastify.log.error('Error starting tournament:', error);
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });

    // /api/tournaments/:id/cancel - Cancel tournament
    fastify.delete('/api/tournaments/:id/cancel', {
        preHandler: [authenticate]
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };

            const tournament = await db.tournament.findUnique({
                where: { id },
                include: {
                    participants: true,
                    games: true
                }
            });

            if (!tournament) {
                return reply.status(404).send({ error: 'Tournament not found' });
            }

            if (tournament.createdById !== request.user!.id) {
                return reply.status(403).send({ error: 'Only the tournament creator can cancel the tournament' });
            }

            if (tournament.status === 'COMPLETED') {
                return reply.status(400).send({ error: 'Cannot cancel a completed tournament' });
            }

            // Update tournament status
            await db.tournament.update({
                where: { id },
                data: { 
                    status: 'CANCELLED',
                    endDate: new Date()
                }
            });

            return reply.status(200).send({ success: true });
        } catch (error) {
            fastify.log.error('Error cancelling tournament:', error);
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });
}
