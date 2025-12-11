import { Server } from "socket.io";
import { applySocketAuth } from "../plugins/socketAuthSession";
import { TypedSocket } from "../socket-io";
import { app } from "../../main";
import { db } from "../trpc/db";
import { isUserOnline } from "../cache";
import { User } from "@prisma/client";

export function setupFriendshipNamespace(io: Server) {
	const friendshipNamespace = io.of("/friendship");
	applySocketAuth(friendshipNamespace);

	friendshipNamespace.on("connection", (socket: TypedSocket) => {
		const { user } = socket.data;
		app.log.info("Friendship socket connected. id=%s, username=%s", socket.id, user.username);

		socket.on("get-online-friends", async () => {
			try {
				const friends = await db.friend.findMany({
					where: {
						userId: user.id,
						state: 'ACCEPTED'
					},
					include: {
						friend: {
							select: {
								id: true,
								username: true,
							}
						}
					}
				});

				const onlineFriends = friends
					.filter(f => isUserOnline(f.friend.id))
					.map(f => ({
						id: f.friend.id,
						username: f.friend.username,
						isOnline: true
					}));

				socket.emit("online-friends", onlineFriends);
			} catch (error) {
				app.log.error("Error getting online friends:", error);
				socket.emit("error", "Error retrieving online friend list");
			}
		});

		socket.on("disconnect", () => {
			app.log.info("Friendship socket disconnected %s", socket.id);
		});
	});
}

export async function sendFriendsListToUser(userId: User['id'], socket: TypedSocket) {
	try {
		const friendRelations = await db.friend.findMany({
			where: {
				userId: userId, state: 'ACCEPTED',
			},
			include: {
				user: {
					select: {
						id: true,
						username: true,
					}
				},
				friend: {
					select: {
						id: true,
						username: true,
					}
				}
			}
		});

		const friendsList = friendRelations.map(relation => {
			return {
				id: relation.friend.id,
				username: relation.friend.username,
				state: isUserOnline(relation.friend.id) ? 'online' : 'offline'
			};
		});

		socket.emit('friends-list', friendsList);
		app.log.debug('Sent friends list to user %s: %d friends', userId, friendsList.length);
	} catch (error) {
		app.log.error('Error sending friends list to user %s:', userId, error);
	}
}
