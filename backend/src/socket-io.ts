import { User } from '@prisma/client';
import '../types/socket'

import { DefaultEventsMap, Server, Socket } from "socket.io";

type SocketData = {
	user: User;
}
// README: if you want to have the custom socket's data type for each listener you have to add the type CustomSocket on the function's parameter
export type TypedSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

/**
 * By default all socket connections are those of a logged in user, because there is a `socketAuthSessionPlugin` middleware that forces the socket to be authenticated.
 * This function sets up the Socket.IO server to listen for new connections and events.
 * @param io Socket.IO server instance
 */
export function setupSocketHandlers(io: Server) {
	console.log("Setting up Socket.IO handlers");
	io.on("connection", (socket: TypedSocket) => {
		console.log("Socket connected", socket.id, socket.data.user.username);

		socket.on('join-matchmaking', () => {
			console.log('Socket joined matchmaking. id=', socket.id);
		});


	});

	io.on("disconnect", (socket) => {
		console.log("Socket disconnected", socket.id);
	});

	io.on("error", (err) => {
		console.error("Socket error", err);
	});
}
