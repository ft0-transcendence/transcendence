import { api } from "../../main";
import { RouteController } from "@tools/ViewController";
import { authManager } from "@tools/AuthManager";
import { RouterOutputs, SocketFriendInfo } from "@shared";
import { k, t, updateDOMTranslations } from "@src/tools/i18n";
import { getProfilePictureUrlByUserId } from "@src/utils/getImage";
import { LoadingOverlay } from "@src/components/LoadingOverlay";

export class HomeController extends RouteController {

	#handleFriendActionClickEvent = this.handleUserActionClickEvent.bind(this);

	#friendsListContainer: HTMLElement | null = null;

	#loadingOverlays: {
		activeGames: LoadingOverlay,
		notifications: LoadingOverlay,
		last20Matches: LoadingOverlay,
	} = {
		activeGames: new LoadingOverlay('active-games'),
		notifications: new LoadingOverlay('notifications'),
		last20Matches: new LoadingOverlay('last-20-matches'),
	}

	constructor() {
		super();
		this.titleSuffix = 'Home';

		this.registerChildComponent(this.#loadingOverlays.activeGames);
		this.registerChildComponent(this.#loadingOverlays.notifications);
		this.registerChildComponent(this.#loadingOverlays.last20Matches);
	}


	async preRender() {
	}

	async render() {
		const userData = authManager.user;

		return /*html*/`
		<div class="flex flex-col w-full grow md:overflow-hidden">
			<div class="flex flex-col items-center w-full grow md:grid md:grid-cols-5 overflow-hidden">
				<div class="flex flex-col items-center overflow-y-auto md:h-full md:overflow-hidden w-full text-center md:col-span-1 bg-zinc-900/50 overflow-hidden shrink-0">
					<!-- User Profile -->
					<div class="flex flex-col items-center w-full p-6 h-44 border-b border-b-white/15 bg-zinc-800/50 shrink-0">
						<div class="relative">
							<img src="${authManager.userImageUrl}"
								 alt="User image"
								 class="user-image w-24 h-24 rounded-full aspect-square object-cover shrink-0 ring-2 ring-amber-500/50 ring-offset-zinc-900">
							<div class="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-green-500 border-2 border-zinc-900"></div>
						</div>
						<div class="text-xl font-bold user-username">${userData?.username}</div>
					</div>

					<!-- Friends List -->
					<div class="flex flex-col w-full grow p-4 border-b border-white/15 md:border-none shrink-0">
						<div class="flex items-center justify-between mb-4">
							<div class="flex items-center gap-2">
								<h2 class="text-lg font-semibold text-gray-300" data-i18n="${k('generic.friends')}">Friends</h2>
								<button id="${this.id}-add-friend-btn"
										class="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
										title="${t('generic.add_friend')}">
									<i class="fa fa-plus text-sm"></i>
								</button>
							</div>
							<span class="text-sm text-gray-400">
								<span class="friends-count">0</span>
								<span data-i18n="${k('generic.online')}">ONLINE</span>
							</span>
						</div>

						<div class="flex-grow overflow-y-auto min-h-0">
							<ul id="${this.id}-friends-list" class="flex flex-col gap-2 w-full">
							</ul>
						</div>
					</div>
				</div>

				<!-- content -->
				<div class="grow flex flex-col w-full text-center md:h-full md:col-span-4 md:border-l md:border-l-white/15 md:overflow-hidden">
					<section class="hidden md:flex flex-col w-full justify-center h-44 px-4 pt-2 border-b border-b-white/15 shrink-0 relative overflow-x-auto">
						<h4 class="capitalize font-bold" data-i18n="${k('generic.currently_active_games')}">Currently Active Games</h4>
						<!-- Active games will be listed here -->
						<ul id="${this.id}-active-games" class="flex flex-row gap-4 w-full items-center justify-center grow overflow-x-auto">
							<span>N/A</span>
						</ul>


						<!-- Loading Overlay -->
						${await this.#loadingOverlays.activeGames.silentRender()}
					</section>
					<section class="flex flex-col md:flex-row grow bg-black md:overflow-hidden">
						<div class="flex flex-col w-full md:w-1/5 min-w-3xs bg-zinc-950 md:h-full p-2 min-h-32 relative">
							<h4 class="capitalize font-bold" data-i18n="${k('generic.notifications')}">Notifications</h4>
							<!-- Notifications will be listed here -->
							<div id="${this.id}-notifications" class="grow flex flex-col w-full p-2 md:overflow-y-auto">
							</div>

							<!-- Loading Overlay -->
							${await this.#loadingOverlays.notifications.silentRender()}
						</div>
						<div class="flex flex-col grow p-2 min-h-32 md:overflow-hidden relative">
							<h4 class="capitalize font-bold" data-i18n="${k('generic.last_20_matches')}">Last 20 Matches</h4>
							<!-- Game history will be listed here -->
							<ul id="${this.id}-game-history" class="grow flex flex-col w-full p-2 md:overflow-y-auto">
							</ul>

							<!-- Loading Overlay -->
							${await this.#loadingOverlays.last20Matches.silentRender()}
						</div>

					</section>
				</div>
			</div>
		</div>
	`;
	}

	async postRender() {
		this.#friendsListContainer = document.querySelector(`#${this.id}-friends-list`);
		const baseSocket = authManager.getBaseSocketConnection();
		if (baseSocket) {
			const currentFriends = authManager.friendsList;
			for (const friend of currentFriends) {
				this.#upsertFriend(friend);
			}
			baseSocket.on('friends-list', (friendsList) => {
				console.debug('Friends list updated', friendsList);
				for (const friend of friendsList) {
					this.#upsertFriend(friend);
				}
			});
			baseSocket.on('friend-updated', (friend) => {
				console.debug('Friend updated', friend);
				this.#upsertFriend(friend);
			});
		} else {
			console.warn('No socket connection. Something weird happened...');
		}

		// TODO: REMOVE THIS MOCK DATA ---------------------
		// const friendsMock: SocketFriendInfo[] = [
		// 	{ id: '1', username: 'Leo (mock)', state: 'online', imageUrl: 'https://picsum.photos/id/10/200/200', imageBlob: null, imageBlobMimeType: null, email: 'leo@example.com', createdAt: new Date() },
		// 	{ id: '2', username: 'Pasquale (mock)', state: 'online', imageUrl: 'https://picsum.photos/id/100/200/200', imageBlob: null, imageBlobMimeType: null, email: 'pasquale@example.com', createdAt: new Date() },
		// 	{ id: '3', username: 'Luca (mock)', state: 'offline', imageUrl: 'https://picsum.photos/id/101/200/200', imageBlob: null, imageBlobMimeType: null, email: 'luca@example.com', createdAt: new Date() },
		// 	{ id: '4', username: 'Giulia (mock)', state: 'online', imageUrl: 'https://picsum.photos/id/102/200/200', imageBlob: null, imageBlobMimeType: null, email: 'giulia@example.com', createdAt: new Date() },
		// ]
		// for (const friend of friendsMock) {
		// 	console.debug('Friend mock', friend);
		// 	this.#upsertFriend(friend);
		// }

		// setTimeout(() => {
		// 	friendsMock[0].state = 'offline';
		// 	this.#upsertFriend(friendsMock[0]);
		// }, 10000);
		// TODO: REMOVE THIS MOCK DATA------------------------

		this.#updateFriendsCount();


		// Active Games
		this.#activeGamesContainer = document.querySelector(`#${this.id}-active-games`);
		this.#fetchAndRenderActiveGames();

		// Notifications
		this.#notificationsContainer = document.querySelector(`#${this.id}-notifications`);
		this.#fetchAndRenderNotifications();

		// Last 20 Matches
		this.#last20MatchesContainer = document.querySelector(`#${this.id}-game-history`);
		this.#fetchAndRenderLast20Matches();


		document.addEventListener('click', this.#handleFriendActionClickEvent);
	}

	async destroy() {
		document.removeEventListener('click', this.#handleFriendActionClickEvent);
	}

	// LAST 20 MATCHES FUNCTIONS ---------------------------------------------------------------------------------------
	#last20MatchesContainer: HTMLElement | null = null;
	async #fetchAndRenderLast20Matches() {
		if (!this.#last20MatchesContainer) return;
		this.#loadingOverlays.last20Matches.show();
		const matches = await api.game.lastNMatches.query({ quantity: 20 });
		this.#renderLast20Matches(matches);
		this.#loadingOverlays.last20Matches.hide();
	}
	#renderLast20Matches(matches: RouterOutputs['game']['lastNMatches']) {
		if (!this.#last20MatchesContainer) return;

		this.#last20MatchesContainer.innerHTML = ``;
		for (const match of matches) {
			const matchElement = document.createElement('li');
			matchElement.className = 'match-item group hover:bg-white/5 transition-colors rounded-lg even:bg-zinc-500/5';
			const myResultClass = match.result === 'W' ? 'text-green-500' : 'text-red-500';
			const mySideIsLeft = match.mySide === 'left';

			matchElement.innerHTML = /*html*/`
			<div class="grid grid-cols-5 items-center px-2 py-3">
				<div class="w-12 text-lg text-center col-span-1">
					<span class="uppercase font-bold ${myResultClass}">${match.result}</span>
				</div>
				<!-- Match Avatar -->
				<div class="grid grid-cols-3 gap-1 items-center col-span-4">
					<div class="flex flex-col justify-center items-center gap-1 text-sm">
						<img src="${getProfilePictureUrlByUserId(match.leftPlayer.id)}"
						 alt="${match.leftPlayer.username}'s avatar"
						 class="w-10 h-10 rounded-full object-cover match-image ring-1 ring-white/10">
						<span>${match.leftPlayer.username}</span>
					</div>
					<div class="text-lg font-bold">
						<span class="${mySideIsLeft ? myResultClass : ''}">${match.leftPlayerScore}</span>
						<span>:</span>
						<span class="${!mySideIsLeft ? myResultClass : ''}">${match.rightPlayerScore}</span>
					</div>
					<div class="flex flex-col justify-center items-center gap-1 text-sm">
						<img src="${getProfilePictureUrlByUserId(match.rightPlayer.id)}"
						 alt="${match.rightPlayer.username}'s avatar"
						 class="w-10 h-10 rounded-full object-cover match-image ring-1 ring-white/10">
						 <span>${match.rightPlayer.username}</span>
					</div>
				</div>
			</div>
		`;
			this.#last20MatchesContainer.appendChild(matchElement);
		}
		if (matches.length === 0) {
			this.#last20MatchesContainer.innerHTML = /*html*/ `
				<div class="flex flex-col items-center justify-center w-full grow">
					<span class="text-lg text-gray-400" data-i18n="${k('generic.no_matches')}">No matches found</span>
				</div>
			`;
		}
	}
	// END LAST 20 MATCHES FUNCTIONS -------------------------------------------------------------------------------------


	// ACTIVE GAMES FUNCTIONS ---------------------------------------------------------------------------------------
	#activeGamesContainer: HTMLElement | null = null;
	async #fetchAndRenderActiveGames() {
		if (!this.#activeGamesContainer) return;
		this.#loadingOverlays.activeGames.show();
		const activeGames = await api.game.getActiveGames.query();
		this.#renderActiveGames(activeGames);
		this.#loadingOverlays.activeGames.hide();
	}

	#renderActiveGames(activeGames: RouterOutputs['game']['getActiveGames']) {
		if (!this.#activeGamesContainer) return;

		this.#activeGamesContainer.innerHTML = ``;
		for (const game of activeGames) {
			const gameElement = document.createElement('li');
			gameElement.className = 'shrink-0 bg-black hover:bg-black/90 game-item group transition-colors rounded-lg even:bg-zinc-500/5 h-full flex items-center justify-center';
			gameElement.id = `game-${game.id}`;
			gameElement.innerHTML = /*html*/`
			<div class="flex items-center justify-center px-1 py-2">
				<div class="grid grid-cols-3 gap-1 items-center col-span-4">
					<div class="flex flex-col justify-center items-center gap-1 text-xs">
						<img src="${getProfilePictureUrlByUserId(game.leftPlayer.id)}"
						 alt="${game.leftPlayer.username}'s avatar"
						 class="w-6 h-6 rounded-full object-cover match-image ring-1 ring-white/10">
						<span>${game.leftPlayer.username}</span>
					</div>
					<div class="text-base font-bold flex items-center justify-center">
						<span class="${game.leftPlayerScore > game.rightPlayerScore ? 'text-green-500' : 'text-red-500'}">${game.leftPlayerScore}</span>
						<span>:</span>
						<span class="${game.leftPlayerScore > game.rightPlayerScore ? 'text-red-500' : 'text-green-500'}">${game.rightPlayerScore}</span>
					</div>
					<div class="flex flex-col justify-center items-center gap-1 text-xs">
						<img src="${getProfilePictureUrlByUserId(game.rightPlayer.id)}"
						 alt="${game.rightPlayer.username}'s avatar"
						 class="w-6 h-6 rounded-full object-cover match-image ring-1 ring-white/10">
						 <span>${game.rightPlayer.username}</span>
					</div>
				</div>
			</div>
		`;
			this.#activeGamesContainer.appendChild(gameElement);
		}
		if (activeGames.length === 0) {
			this.#activeGamesContainer.innerHTML = /*html*/ `
				<div class="flex flex-col items-center justify-center w-full grow">
					<span class="text-lg text-gray-400" data-i18n="${k('generic.no_games')}">No games found</span>
				</div>
			`;
		}
	}

	// END ACTIVE GAMES FUNCTIONS --------------------------------------------------------------------------------------

	// NOTIFICATIONS FUNCTIONS -----------------------------------------------------------------------------------------
	#notificationsContainer: HTMLElement | null = null;
	async #fetchAndRenderNotifications() {
		if (!this.#notificationsContainer) return;
		this.#loadingOverlays.notifications.show();
		const pendingFriendsRequests = await api.friendship.getPendingRequests.query();
		this.#renderNotifications(pendingFriendsRequests);
		this.#loadingOverlays.notifications.hide();
	}
	#renderNotifications(pendingFriendsRequests: RouterOutputs['friendship']['getPendingRequests']) {
		if (!this.#notificationsContainer) return;
		this.#notificationsContainer.innerHTML = ``;
		for (const friend of pendingFriendsRequests) {
			const friendElement = document.createElement('li');
			friendElement.className = 'friend-item group hover:bg-white/5 transition-colors rounded-lg';
			friendElement.id = `frien-list-item-${friend.id}`;
			friendElement.innerHTML = /*html*/`
			<div class="flex items-center gap-3 p-2">
				<!-- Friend Avatar -->
				<div class="relative">
					<img src="${getProfilePictureUrlByUserId(friend.id)}"
						 alt="${friend.username}'s avatar"
						 class="w-10 h-10 rounded-full object-cover friend-image ring-1 ring-white/10">
				</div>
				<div class="flex flex-col grow">
					<span class="text-sm font-semibold friend-username">${friend.username}</span>
					</div>
				<div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
					<button class="py-1 px-2 cursor-pointer rounded-full hover:bg-white/10 transition-colors friend-action-button">
						<i class="fa fa-ellipsis-v" aria-hidden="true"></i>
					</button>
				</div>
			</div>
		`;
			this.#notificationsContainer.appendChild(friendElement);
		}
		if (pendingFriendsRequests.length === 0) {
			this.#notificationsContainer.innerHTML = /*html*/`
				<div class="flex flex-col items-center justify-center w-full grow">
					<span class="text-lg text-gray-400" data-i18n="${k('generic.no_notifications')}">Nothing here</span>
				</div>
			`;
		}
	}


	// END NOTIFICATIONS FUNCTIONS -------------------------------------------------------------------------------------


	// FRIEND LIST FUNCTIONS -------------------------------------------------------------------------------------------

	#upsertFriend(friend: SocketFriendInfo) {
		const existingFriend = document.querySelector(`#${this.id}-friends-list li[id="friend-${friend!.id}"]`) as HTMLElement | null;
		if (existingFriend) {
			this.#updateFriendFields(friend, existingFriend);
		} else {
			const friendElement = this.#createFriendElement(friend);
			if (friendElement) {
				this.#friendsListContainer?.appendChild(friendElement);
			}
		}
	}

	#updateFriendFields(friend: SocketFriendInfo, friendElement: HTMLElement) {
		if (!friend) return null;

		const usernameField = friendElement.querySelector('.friend-username');
		if (usernameField) {
			usernameField.textContent = friend.username;
		}

		const statusField = friendElement.querySelector('.friend-status');

		if (statusField) {
			statusField.setAttribute('data-i18n', friend.state === 'online' ? k('generic.online') : k('generic.offline'));
		}
		const imageField = friendElement.querySelector('.friend-image') as HTMLImageElement;
		if (imageField){
			imageField.src = getProfilePictureUrlByUserId(friend.id);
		}

		const statusIcon = friendElement.querySelector('.friend-status-icon');
		statusIcon?.classList.remove('friend-status-icon-online', 'friend-status-icon-offline');
		if (friend.state === 'online') {
			statusIcon?.classList.add('friend-status-icon-online');
		} else {
			statusIcon?.classList.add('friend-status-icon-offline');
		}

		this.#updateFriendsCount();
		updateDOMTranslations(friendElement);
	}

	#updateFriendsCount() {
		const friendsCount = document.querySelector('.friends-count');
		if (friendsCount) {
			const onlineFriends = this.#friendsListContainer?.querySelectorAll('.friend-status-icon-online').length ?? 0;
			friendsCount.textContent = `${onlineFriends}`;
		}
	}

	#createFriendElement(friend: SocketFriendInfo) {
		if (!friend) return null;
		const friendElement = document.createElement('li');
		friendElement.id = `friend-${friend.id}`;
		friendElement.className = `friend-item group hover:bg-white/5 transition-colors rounded-lg`;
		friendElement.innerHTML = /*html*/`
		<div class="flex items-center gap-3 p-2">
			<!-- Friend Avatar -->
			<div class="relative">
				<img src="${getProfilePictureUrlByUserId(friend.id)}"
					 alt="${friend.username}'s avatar"
					 class="w-10 h-10 rounded-full object-cover friend-image ring-1 ring-white/10">
				<div class="friend-status-icon absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-zinc-900
							${friend.state === 'online' ? 'friend-status-icon-online' : 'friend-status-icon-offline'}">
				</div>
			</div>

			<!-- Friend Info -->
			<div class="flex flex-col grow">
				<span class="text-sm font-semibold friend-username">${friend.username}</span>
				<span class="text-xs text-gray-400 friend-status capitalize" data-i18n="${friend.state === 'online' ? k('generic.online') : k('generic.offline')}">
					${friend.state === 'online' ? t('generic.online') : t('generic.offline')}
				</span>
			</div>

			<!-- Action Buttons -->
			<div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
				<button class="py-1 px-2 cursor-pointer rounded-full hover:bg-white/10 transition-colors friend-action-button">
					<i class="fa fa-ellipsis-v" aria-hidden="true"></i>
				</button>
			</div>
		</div>
	`;
		return friendElement;
	}

	private handleUserActionClickEvent(event: MouseEvent) {
		const target = event.target as HTMLElement;
		const actionButton = target.closest('.friend-action-button');
		if (!actionButton) return;

		const friendId = target.closest('.friend-item')?.id?.replace('friend-', '');
		if (!friendId) return;

		console.log('Friend action button clicked', friendId);
	}

	// END FRIEND LIST FUNCTIONS ---------------------------------------------------------------------------------------

}
