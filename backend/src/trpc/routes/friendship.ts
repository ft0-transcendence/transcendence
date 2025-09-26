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
					friendRelationId: f.id,
					isOnline: isUserOnline(f.user.id),
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
					friends: {
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

			const friendsList = userWithFriends.friends;
			const mappedFriendsList = friendsList.map(f=>{
				return {
					id: f.user.id,
					username: f.user.username,
					friendRelationId: f.id,
				}
			});
			mappedFriendsList.sort((a, b) => a.username.localeCompare(b.username));
			return mappedFriendsList;
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
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'You already sent a friend request to this user'
					});
				}
				else if (existingRequest.userId !== ctx.user!.id) {
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

					await notifyFriendshipAccepted(targetUser.id, ctx.user!.id);

					return {
						message: `Now you're friend of ${targetUser.username}`
					};
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

			return {
				message: `Friend request sent to ${targetUser.username}`
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

			await notifyFriendshipAccepted(ctx.user!.id, request.userId);

			return {
				success: true,
				message: `Now you're friend of ${requester?.username}`,
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

			await ctx.db.friend.update({
				where: { id: input.requestId },
				data: { state: FriendState.REJECTED }
			});

			return {
				success: true,
				message: "Friend request rejected"
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
				message: "Friend removed from your list"
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
				user: sender
			});

			recipientSocket.emit('notification', {
				type: 'info',
				message: `${sender.username} sent you a frien request`
			});
		}

		fastify.log.debug('Notified friend request received: %s -> %s', senderId, recipientId);
	} catch (error) {
		fastify.log.error('Error notifying friend request received:', error);
	}
}

async function notifyFriendshipAccepted(accepterId: string, requesterId: string) {
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
			// README: serve? notification nella lista oppure notification come toast in alto a destra?
			accepterSocket.emit('notification', {
				type: 'success',
				message: `Ora sei amico di ${requester.username}`
			});
		}

		const requesterSocket = cache.onlineUsers.get(requesterId);
		if (requesterSocket) {
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

async function notifyFriendshipRemoved(removerId: string, removedId: string) {
	try {
		const removerSocket = cache.onlineUsers.get(removerId);
		if (removerSocket) {
			removerSocket.emit('friend-removed', { friendId: removedId });
		}

		const removedSocket = cache.onlineUsers.get(removedId);
		if (removedSocket) {
			removedSocket.emit('friend-removed', { friendId: removerId });
		}

		fastify.log.debug('Notified friendship removed between %s and %s', removerId, removedId);
	} catch (error) {
		fastify.log.error('Error notifying friendship removed:', error);
	}
}
