import { GameType, User, Game as PrismaGame } from '@prisma/client';

import { DefaultEventsMap, Namespace, Server, Socket } from "socket.io";
import { cache, addUserToOnlineCache, removeUserFromOnlineCache, isUserOnline } from './cache';
import { Game, GameStatus, GameUserInfo, MovePaddleAction, STANDARD_GAME_CONFIG } from '../game/game';
import { OnlineGame } from '../game/onlineGame';
import { BracketGenerator } from '../game/bracketGenerator';
import { app } from '../main';
import { applySocketAuth } from './plugins/socketAuthSession';
import { db } from './trpc/db';
import { finalizeVsGameResult } from './services/vsGameService';
import { craftTournamentDTODetailsForUser, getTournamentFullDetailsById } from './trpc/routes/tournament';
import { setupMatchmakingNamespace } from './socket/matchmakingSocketNamespace';
import { setupOnlineVersusGameNamespace } from './socket/versusGameSocketNamespace';
import { setupTournamentNamespace } from './socket/tournamentSocketNamespace';
import { sendFriendsListToUser, setupFriendshipNamespace } from './socket/friendshipSocketNamespace';
import { setupTournamentGameNamespace } from './socket/tournamentGameSocketNamespace';


type SocketData = {
	user: User;
}

export type SocketFriendInfo = {
	id: string;
	username: string;
	state: 'online' | 'offline';
	// lastSeen: Date;
}

// README: if you want to have the custom socket's data type for each listener you have to add the type CustomSocket on the function's parameter
export type TypedSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;
export type TypedSocketNamespace = Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

export function setupSocketHandlers(io: Server) {
	// Each namespace if requires authentication should call `applySocketAuth` after the namespace is created

	setupMatchmakingNamespace(io);
	setupOnlineVersusGameNamespace(io);
	setupFriendshipNamespace(io);

	setupTournamentNamespace(io);
	setupTournamentGameNamespace(io);

	app.log.info("Setting up Socket.IO handlers");
	io.on("connection", async (socket: TypedSocket) => {
		app.log.info("Socket connected. id=%s, username=%s", socket.id, socket.data.user.username);
		addUserToOnlineCache(socket.data.user.id, socket);

		await sendFriendsListToUser(socket.data.user.id, socket);

		socket.on("disconnect", async (reason) => {
			app.log.info("Socket disconnected %s", socket.id);
			if (socket.data?.user) {
				removeUserFromOnlineCache(socket.data.user.id, socket);
			}
		});
	});

	io.on("error", (err) => {
		app.log.error("Socket.IO error: %s", err);
	});
}
