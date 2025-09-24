import {protectedProcedure, t} from "../trpc";
import { z } from "zod";
import { FriendState } from "@prisma/client";
import { isUserOnline, cache } from "../../cache";
import { fastify } from "../../../main";

export const friendshipRouter = t.router({
	getFriends: protectedProcedure
		.query(async ({ctx}) => {
			const friendRelations = await ctx.db.friend.findMany({
				where: {
					OR: [
						{ userId: ctx.user!.id, state: FriendState.ACCEPTED },
						{ friendId: ctx.user!.id, state: FriendState.ACCEPTED }
					]
				},
				include: {
					user: {
						select: {
							id: true,
							username: true,
							imageUrl: true,
							imageBlob: true,
							imageBlobMimeType: true
						}
					},
					friend: {
						select: {
							id: true,
							username: true,
							imageUrl: true,
							imageBlob: true,
							imageBlobMimeType: true
						}
					}
				}
			});

			return friendRelations.map(relation => {
				const friend = relation.userId === ctx.user!.id ? relation.friend : relation.user;
				
				return {
					id: friend.id,
					username: friend.username,
					imageUrl: friend.imageUrl,
					imageBlob: friend.imageBlob,
					imageBlobMimeType: friend.imageBlobMimeType,
					isOnline: isUserOnline(friend.id)
				};
			});
		}),

	getPendingRequests: protectedProcedure
		.query(async ({ctx}) => {
			const pendingRequests = await ctx.db.friend.findMany({
				where: {
					friendId: ctx.user!.id,
					state: FriendState.PENDING
				},
				include: {
					user: {
						select: {
							id: true,
							username: true,
							imageUrl: true,
							imageBlob: true,
							imageBlobMimeType: true
						}
					}
				}
			});

			return pendingRequests.map(f => ({
				id: f.id,
				user: {
					id: f.user.id,
					username: f.user.username,
					imageUrl: f.user.imageUrl,
					imageBlob: f.user.imageBlob,
					imageBlobMimeType: f.user.imageBlobMimeType
				}
			}));
		}),

	sendFriendRequest: protectedProcedure
		.input(z.object({
			username: z.string().min(1, "Username required")
		}))
		.mutation(async ({ctx, input}) => {
			// Trova l'utente da aggiungere
			const targetUser = await ctx.db.user.findFirst({
				where: { username: input.username }
			});

			if (!targetUser) {
				throw new Error("USER_NOT_FOUND");
			}

			if (targetUser.id === ctx.user!.id) {
				throw new Error("CANNOT_ADD_SELF");
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
					throw new Error("ALREADY_FRIENDS");
				} else if (existingRequest.state === FriendState.PENDING) {
					throw new Error("REQUEST_ALREADY_SENT");
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
				success: true,
				message: `Friend request sent to ${targetUser.username}`
			};
		}),

	acceptFriendRequest: protectedProcedure
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
					imageUrl: true,
					imageBlob: true,
					imageBlobMimeType: true
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
				success: true,
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
					imageUrl: true,
					imageBlob: true,
					imageBlobMimeType: true
				},
				take: 10
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
				imageUrl: true,
				imageBlob: true,
				imageBlobMimeType: true
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
					imageUrl: true,
					imageBlob: true,
					imageBlobMimeType: true
				}
			}),
			fastify.prisma.user.findFirst({
				where: { id: requesterId },
				select: {
					id: true,
					username: true,
					imageUrl: true,
					imageBlob: true,
					imageBlobMimeType: true
				}
			})
		]);

		if (!accepter || !requester) return;

		const accepterFriend = {
			id: accepter.id,
			username: accepter.username,
			imageUrl: accepter.imageUrl,
			imageBlob: accepter.imageBlob,
			imageBlobMimeType: accepter.imageBlobMimeType,
			state: isUserOnline(accepter.id) ? 'online' : 'offline'
		};

		const requesterFriend = {
			id: requester.id,
			username: requester.username,
			imageUrl: requester.imageUrl,
			imageBlob: requester.imageBlob,
			imageBlobMimeType: requester.imageBlobMimeType,
			state: isUserOnline(requester.id) ? 'online' : 'offline'
		};

		const accepterSocket = cache.onlineUsers.get(accepterId);
		if (accepterSocket) {
			accepterSocket.emit('friend-updated', requesterFriend);
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
