import {protectedProcedure, t} from "../trpc";
import { z } from "zod";
import { FriendState } from "@prisma/client";
import { isUserOnline, cache } from "../../cache";
import { fastify } from "../../../main";
import { TRPCError } from "@trpc/server";
import { RouterOutputs } from "../root";

export const friendshipRouter = t.router({
	getFriends: protectedProcedure
		.query(async ({ctx}) => {
			const userWithFriends = await ctx.db.user.findFirst({
				where: { id: ctx.user!.id },
				include: {
					friends: {
						where: {
							state: FriendState.ACCEPTED,
						},
						select: {
							id: true,
							user: {
								select: {
									id: true,
									username: true,
								}
							}
						}
					}
				}
			});

			// shouldn't happen
			if (!userWithFriends) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

			const friendsList = userWithFriends.friends;
			const mappedFriendsList = friendsList.map(f=>{
				return {
					id: f.user.id,
					username: f.user.username,
					state: isUserOnline(f.user.id) ? 'online' : 'offline'
				}
			});
			mappedFriendsList.sort((a, b) => a.username.localeCompare(b.username));
			return mappedFriendsList;
		}),

	getPendingRequests: protectedProcedure
		.query(async ({ctx}) => {
			const userWithFriends = await ctx.db.user.findFirst({
				where: { id: ctx.user!.id },
				include: {
					friendOf: {
						where: {
							state: FriendState.PENDING,
						},
						select: {
							id: true,
							user: {
								select: {
									id: true,
									username: true,
								}
							}
						}
					}
				}
			});

			// shouldn't happen
			if (!userWithFriends) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

			const friendsList = userWithFriends.friendOf;
			const mappedFriendsList = friendsList.map(f=>{
				return {
					id: f.id,
					username: f.user.username,
					friendRelationId: f.user.id,
					type: 'received' as const,
				}
			});
			mappedFriendsList.sort((a, b) => a.username.localeCompare(b.username));
			return mappedFriendsList;
		}),

	getSentRequests: protectedProcedure
		.query(async ({ctx}) => {
			const userWithSentRequests = await ctx.db.user.findFirst({
				where: { id: ctx.user!.id },
				include: {
					friends: {
						where: {
							state: FriendState.PENDING,
						},
						select: {
							id: true,
							friend: {
								select: {
									id: true,
									username: true,
								}
							}
						}
					}
				}
			});

			// shouldn't happen
			if (!userWithSentRequests) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

			const sentRequestsList = userWithSentRequests.friends;
			const mappedSentRequestsList = sentRequestsList.map(f=>{
				return {
					id: f.id,
					username: f.friend.username,
					friendRelationId: f.friend.id,
					type: 'sent' as const,
				}
			});
			mappedSentRequestsList.sort((a, b) => a.username.localeCompare(b.username));
			return mappedSentRequestsList;
		}),

	sendFriendRequest: protectedProcedure
		.input(z.object({
			username: z.string().min(1, "Username required")
		}))
		.mutation(async ({ctx, input}) => {
			// Trova l'utente da aggiungere
			const targetUser = await ctx.db.user.findFirst({
				where: {
					username: input.username,
				}
			});

			if (!targetUser) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'User not found'
				});
			}

			if (targetUser.id === ctx.user!.id) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'You cannot send a friend request to yourself'
				});
			}

			const existingRequest = await ctx.db.friend.findFirst({
				where: {
					OR: [
						{
							userId: ctx.user!.id,
							friendId: targetUser.id
						},
						{
							userId: targetUser.id,
							friendId: ctx.user!.id
						}
					]
				}
			});

			if (existingRequest) {
				if (existingRequest.state === FriendState.ACCEPTED) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'You already have a friendship with this user'
					});
				}

				if (existingRequest.state === FriendState.PENDING) {
					if (existingRequest.userId === ctx.user!.id) {
						throw new TRPCError({
							code: 'BAD_REQUEST',
							message: 'You already sent a friend request to this user'
						});
					} else {
						await ctx.db.friend.update({
							where: { id: existingRequest.id },
							data: { state: FriendState.ACCEPTED }
						});
						await ctx.db.friend.create({
							data: {
								userId: ctx.user!.id,
								friendId: targetUser.id,
								state: FriendState.ACCEPTED
							},
						});

						await notifyFriendshipAccepted(ctx.user!.id, targetUser.id, existingRequest.id);

						return {
							success: true
						};
					}
				}


			}

			const friendRequest = await ctx.db.friend.create({
				data: {
					userId: ctx.user!.id,
					friendId: targetUser.id,
					state: FriendState.PENDING
				}
			});

			await notifyFriendRequestReceived(targetUser.id, ctx.user!.id, friendRequest.id);
			await notifyFriendRequestSent(ctx.user!.id, targetUser.id, friendRequest.id);

			return {
				success: true
			};
		}),

	acceptFriendRequest: protectedProcedure
		.input(z.object({
			requestId: z.string().min(1)
		}))
		.mutation(async ({ctx, input}) => {
			const request = await ctx.db.friend.findFirst({
				where: {
					id: input.requestId,
					friendId: ctx.user!.id,
					state: FriendState.PENDING
				}
			});

			if (!request) {
				throw new Error("REQUEST_NOT_FOUND");
			}

			await ctx.db.friend.update({
				where: { id: input.requestId },
				data: { state: FriendState.ACCEPTED }
			});

			await ctx.db.friend.create({
				data: {
					userId: ctx.user!.id,
					friendId: request.userId,
					state: FriendState.ACCEPTED
				}
			});

			const requester = await ctx.db.user.findFirst({
				where: { id: request.userId },
				select: {
					id: true,
					username: true,
				}
			});

			await notifyFriendshipAccepted(ctx.user!.id, request.userId, input.requestId);

			return {
				success: true,
				friend: requester
			};
		}),

	rejectFriendRequest: protectedProcedure
		.input(z.object({
			requestId: z.string()
		}))
		.mutation(async ({ctx, input}) => {
			const request = await ctx.db.friend.findFirst({
				where: {
					id: input.requestId,
					friendId: ctx.user!.id,
					state: FriendState.PENDING
				}
			});

			if (!request) {
				throw new Error("REQUEST_NOT_FOUND");
			}

			await ctx.db.friend.delete({
				where: { id: input.requestId }
			});

			await notifyFriendRequestRejected(request.userId, ctx.user!.id, input.requestId);

			return {
				success: true
			};
		}),

	removeFriend: protectedProcedure
		.input(z.object({
			friendId: z.string()
		}))
		.mutation(async ({ctx, input}) => {
			await ctx.db.friend.deleteMany({
				where: {
					OR: [
						{
							userId: ctx.user!.id,
							friendId: input.friendId
						},
						{
							userId: input.friendId,
							friendId: ctx.user!.id
						}
					]
				}
			});

			await notifyFriendshipRemoved(ctx.user!.id, input.friendId);

			return {
				success: true
			};
		}),

	searchUsers: protectedProcedure
		.input(z.object({
			username: z.string().min(1, "Username required")
		}))
		.query(async ({ctx, input}) => {
			const users = await ctx.db.user.findMany({
				where: {
					username: {
						contains: input.username,
					},
					id: {
						not: ctx.user!.id
					}
				},
				select: {
					id: true,
					username: true,
				}
			});

			return users;
		})
})

async function notifyFriendRequestReceived(recipientId: string, senderId: string, requestId: string) {
	try {
		const sender = await fastify.prisma.user.findFirst({
			where: { id: senderId },
			select: {
				id: true,
				username: true,
			}
		});

		if (!sender) return;

		const recipientSocket = cache.onlineUsers.get(recipientId);
		if (recipientSocket) {
			recipientSocket.emit('friend-request-received', {
				id: requestId,
				username: sender.username,
				friendRelationId: recipientId,
			});

			recipientSocket.emit('notification', {
				type: 'info',
				message: `${sender.username} sent you a friend request`
			});
		}

		fastify.log.debug('Notified friend request received: %s -> %s', senderId, recipientId);
	} catch (error) {
		fastify.log.error('Error notifying friend request received:', error);
	}
}

async function notifyFriendRequestSent(senderId: string, recipientId: string, requestId: string) {
	try {
		const recipient = await fastify.prisma.user.findFirst({
			where: { id: recipientId },
			select: {
				id: true,
				username: true,
			}
		});

		if (!recipient) return;

		const senderSocket = cache.onlineUsers.get(senderId);
		if (senderSocket) {
			senderSocket.emit('friend-request-sent', {
				id: requestId,
				username: recipient.username,
				friendRelationId: recipientId,
				type: 'sent' as const,
			});
			
			senderSocket.emit('notification', {
				type: 'success',
				message: `Friend request sent to ${recipient.username}`
			});
		}

		fastify.log.debug('Notified friend request sent: %s -> %s', senderId, recipientId);
	} catch (error) {
		fastify.log.error('Error notifying friend request sent:', error);
	}
}

async function notifyFriendshipAccepted(accepterId: string, requesterId: string, requestId: string) {
	try {
		const [accepter, requester] = await Promise.all([
			fastify.prisma.user.findFirst({
				where: { id: accepterId },
				select: {
					id: true,
					username: true,
				}
			}),
			fastify.prisma.user.findFirst({
				where: { id: requesterId },
				select: {
					id: true,
					username: true,
				}
			})
		]);

		if (!accepter || !requester) return;

		const accepterFriend = {
			id: accepter.id,
			username: accepter.username,
			state: isUserOnline(accepter.id) ? 'online' : 'offline'
		};

		const requesterFriend = {
			id: requester.id,
			username: requester.username,
			state: isUserOnline(requester.id) ? 'online' : 'offline'
		};

		const accepterSocket = cache.onlineUsers.get(accepterId);
		if (accepterSocket) {
			accepterSocket.emit('friend-updated', requesterFriend);
			accepterSocket.emit('notification', {
				type: 'success',
				message: `You are now friends with ${requester.username}`
			});
		}

		const requesterSocket = cache.onlineUsers.get(requesterId);
		if (requesterSocket) {
			requesterSocket.emit('friend-request-accepted', { requestId });
			requesterSocket.emit('friend-updated', accepterFriend);
			requesterSocket.emit('notification', {
				type: 'success',
				message: `${accepter.username} accepted your friend request`
			});
		}

		fastify.log.debug('Notified friendship accepted between %s and %s', accepterId, requesterId);
	} catch (error) {
		fastify.log.error('Error notifying friendship accepted:', error);
	}
}

async function notifyFriendRequestRejected(requesterId: string, rejecterId: string, requestId: string) {
	try {
		const [requester, rejecter] = await Promise.all([
			fastify.prisma.user.findFirst({
				where: { id: requesterId },
				select: {
					id: true,
					username: true,
				}
			}),
			fastify.prisma.user.findFirst({
				where: { id: rejecterId },
				select: {
					id: true,
					username: true,
				}
			})
		]);

		if (!requester || !rejecter) return;

		const rejecterSocket = cache.onlineUsers.get(rejecterId);
		if (rejecterSocket) {
			rejecterSocket.emit('notification', {
				type: 'info',
				message: `You declined ${requester.username}'s friend request`
			});
		}

		const requesterSocket = cache.onlineUsers.get(requesterId);
		if (requesterSocket) {
			requesterSocket.emit('friend-request-rejected', { requestId });
			requesterSocket.emit('notification', {
				type: 'info',
				message: `${rejecter.username} declined your friend request`
			});
		}

		fastify.log.debug('Notified friend request rejected: %s -> %s', requesterId, rejecterId);
	} catch (error) {
		fastify.log.error('Error notifying friend request rejected:', error);
	}
}

async function notifyFriendshipRemoved(removerId: string, removedId: string) {
	try {
		const [remover, removed] = await Promise.all([
			fastify.prisma.user.findFirst({
				where: { id: removerId },
				select: {
					id: true,
					username: true,
				}
			}),
			fastify.prisma.user.findFirst({
				where: { id: removedId },
				select: {
					id: true,
					username: true,
				}
			})
		]);

		if (!remover || !removed) return;

		const removerSocket = cache.onlineUsers.get(removerId);
		if (removerSocket) {
			removerSocket.emit('friend-removed', { friendId: removedId });
			removerSocket.emit('notification', {
				type: 'info',
				message: `You removed ${removed.username} from your friends list`
			});
		}

		const removedSocket = cache.onlineUsers.get(removedId);
		if (removedSocket) {
			removedSocket.emit('friend-removed', { friendId: removerId });
			removedSocket.emit('notification', {
				type: 'info',
				message: `${remover.username} removed you from their friends list`
			});
		}

		fastify.log.debug('Notified friendship removed between %s and %s', removerId, removedId);
	} catch (error) {
		fastify.log.error('Error notifying friendship removed:', error);
	}
}
