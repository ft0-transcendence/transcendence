import { api } from "../../main";
import { RouteController } from "@tools/ViewController";
import { authManager } from "@tools/AuthManager";
import { RouterInputs, RouterOutputs, SocketFriendInfo } from "@shared";
import { k, t, updateDOMTranslations } from "@src/tools/i18n";
import { getProfilePictureUrlByUserId } from "@src/utils/getImage";
import { LoadingOverlay } from "@src/components/LoadingOverlay";
import { TRPCError } from "@trpc/server";
import toast from "@src/tools/Toast";
import { TRPCClientError } from "@trpc/client";
import { ZodError } from "zod";
import { isMobile } from "@src/utils/agentUtils";
import { ConfirmModal } from "@src/tools/ConfirmModal";
import { Socket } from "socket.io-client";

export class HomeController extends RouteController {
	#baseSocket: Socket | null = null;

	#friendsListContainer: HTMLElement | null = null;

	#loadingOverlays: {
		FriendRequests: LoadingOverlay,
		last20Matches: LoadingOverlay,
		pendingFriends: LoadingOverlay,
	} = {
			FriendRequests: new LoadingOverlay('FriendRequests'),
			last20Matches: new LoadingOverlay('last-20-matches'),
			pendingFriends: new LoadingOverlay('pending-friends'),
		}

	#userStats: RouterOutputs['user']['getUserStats'] | null = null;

	constructor() {
		super();
		this.titleSuffix = 'Home';

		this.registerChildComponent(this.#loadingOverlays.FriendRequests);
		this.registerChildComponent(this.#loadingOverlays.last20Matches);
		this.registerChildComponent(this.#loadingOverlays.pendingFriends);
	}



	async preRender() {
		this.#userStats = await api.user.getUserStats.query();
	}

	async render() {
		const userData = authManager.user;
		const userStats = this.#userStats!;

		return /*html*/`
		<div class="flex flex-col w-full grow md:overflow-hidden">
			<div class="flex flex-col items-center w-full grow md:grid md:grid-cols-5 overflow-hidden">
				<div class="flex flex-col items-center overflow-y-auto md:overflow-y-hidden md:h-full md:overflow-hidden w-full text-center md:col-span-1 bg-zinc-900/50 overflow-hidden shrink-0">
				<!-- User Profile (Mobile) -->
				<div class="md:!hidden flex flex-col items-center w-full px-4 py-4 border-b border-white/15 bg-zinc-900/50">
					<div class="flex flex-col items-center gap-2">
						<div class="relative w-20 h-20 flex items-center justify-center">
							<img src="${authManager.userImageUrl}"
								alt="User image"
								class="user-image w-20 h-20 rounded-full object-cover shrink-0 ring-2 ring-amber-500/50 ring-offset-zinc-900">
							<div class="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-green-500 border-2 border-zinc-900"></div>
						</div>
						<div class="text-base font-bold truncate max-w-[180px] text-center">
							${userData?.username}
						</div>
					</div>

					<!-- User Stats (Mobile) -->
					<div class="user-stats-container grid grid-cols-6 gap-3 w-full mt-4 text-center">
						<div class="flex flex-col items-center justify-center p-2 bg-black/30 rounded-md col-span-2">
							<span class="text-lg font-semibold">${userStats.totalWins}</span>
							<span class="text-xs text-gray-400 capitalize" data-i18n="${k('generic.wins')}">Wins</span>
						</div>
						<div class="flex flex-col items-center justify-center p-2 bg-black/30 rounded-md col-span-2">
							<span class="text-lg font-semibold">${userStats.totalLosses}</span>
							<span class="text-xs text-gray-400 capitalize" data-i18n="${k('generic.losses')}">Losses</span>
						</div>
						<div class="flex flex-col items-center justify-center p-2 bg-black/30 rounded-md col-span-2">
							<span class="text-lg font-semibold">${userStats.tournamentsWon}</span>
							<span class="text-xs text-gray-400 capitalize" data-i18n="${k('generic.tournaments_won')}">Tournaments Won</span>
						</div>

						<div class="flex flex-col items-center justify-center p-2 bg-black/30 rounded-md col-span-3">
							<span class="text-lg font-semibold">${userStats.totalGames}</span>
							<div class="text-xs text-gray-400 capitalize mt-1" data-i18n="${k('generic.played_games')}">Played Games</div>
						</div>

						<div class="flex flex-col items-center justify-center bg-black/30 rounded-md p-1 col-span-3">
							<div class="progress-circle" style="--percent:${userStats.winRate};--size:42px;">
								<span>${userStats.winRate}%</span>
							</div>
							<div class="text-xs text-gray-400 capitalize mt-1" data-i18n="${k('generic.win_rate')}">Win Rate</div>
						</div>

					</div>
				</div>

					<!-- Friends List -->
					<div class="flex flex-col w-full grow border-b border-white/15 md:border-none relative md:overflow-hidden">
						<div class="flex items-center justify-between bg-black/50 p-4 overflow-y-hidden">
							<div class="flex items-center gap-2">
								<h2 class="capitalize text-md xl:text-lg font-semibold text-gray-300" data-i18n="${k('generic.friends')}">Friends</h2>
								<button id="${this.id}-add-friend-btn"
										class="cursor-pointer w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
										title="${t('generic.add_friend')}">
									<i class="toggle-friend-add-icon fa fa-plus text-sm"></i>
								</button>
							</div>


							<div class="flex grow justify-end gap-2">
								<div class="text-xs xl:text-sm text-gray-400">
									<span class="friends-count">0</span>
									<span data-i18n="${k('generic.online')}">ONLINE</span>
								</div>

								<div class="text-xs font-bold flex justify-end items-center">
									<button class="toggle-friends show-friends uppercase cursor-pointer text-white hover:text-yellow-500 active:text-yellow-400 hidden" data-i18n="${k('generic.show')}">Show</button>
									<button class="toggle-friends hide-friends uppercase cursor-pointer text-white hover:text-yellow-500 active:text-yellow-400" data-i18n="${k('generic.hide')}">Hide</button>
								</div>
							</div>
						</div>
						<form id="${this.id}-add-friend-form" class="text-left relative hidden px-4 py-3 bg-black/25">
							<label for="${this.id}-add-friend-input" class="text-sm text-gray-400" data-i18n="${k('generic.add_friend')}">Add Friend</label>
							<div class="flex relative border border-gray-300/5 bg-white/5 p-2 text-sm focus-within:border-teal-500 rounded-md focus-within:ring-teal-500">
								<input id="${this.id}-add-friend-input" type="text" class="ring-0 border-0 outline-0 text-white w-full" placeholder="username">
								<button type="submit" class="cursor-pointer hover:text-gray-200 active:text-white"><i class="fa fa-send text-sm"></i><span class="hidden md:flex" data-i18n="${k('generic.send')}">Send</span></button>
							</div>
						</form>

						<ul id="${this.id}-friends-list" class="flex flex-col gap-2 w-full grow overflow-y-auto xl:px-4 py-2"></ul>

						<div class="md:grow"></div>

						<div class="flex flex-col md:overflow-hidden min-h-0">
							<div class="flex items-center p-4 bg-black/50 border-t border-white/15">
								<h2 class="capitalize text-md xl:text-lg font-semibold text-gray-300" data-i18n="${k('generic.sent_friend_requests')}">Sent requests</h2>
								<div class="flex grow justify-end items-center text-xs font-bold">
									<button class="toggle-pending-friends show-pending-friends uppercase cursor-pointer text-white hover:text-yellow-500 active:text-yellow-400 hidden" data-i18n="${k('generic.show')}">Show</button>
									<button class="toggle-pending-friends hide-pending-friends uppercase cursor-pointer text-white hover:text-yellow-500 active:text-yellow-400" data-i18n="${k('generic.hide')}">Hide</button>
								</div>
							</div>

							<ul id="${this.id}-pending-friends-list" class="flex flex-col gap-2 w-full grow overflow-y-auto px-4 py-2 empty:!p-0"></ul>
						</div>


						<!-- Loading Overlay -->
						${await this.#loadingOverlays.pendingFriends.silentRender()}
					</div>
				</div>

				<!-- content -->
				<div class="grow flex flex-col w-full text-center md:h-full md:col-span-4 md:border-l md:border-l-white/15 md:overflow-hidden">
					<!-- User Profile -->
					<section class="hidden md:flex justify-start gap-4 items-center px-6 py-3 border-b border-b-white/15 shrink-0 relative overflow-x-auto">
						<div class="flex flex-col justify-start border-b-white/15 gap-2">
							<div class="relative w-24 h-24 flex items-center justify-center">
								<img src="${authManager.userImageUrl}"
										alt="User image"
										class="user-image w-24 h-24 rounded-full object-cover shrink-0 ring-2 ring-amber-500/50 ring-offset-zinc-900">
								<div class="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-green-500 border-2 border-zinc-900"></div>
							</div>
							<div class="flex justify-center items-center overflow-hidden text-base font-bold">
								<div class="user-username overflow-ellipsis line-clamp-1">
									${userData?.username}
								</div>
							</div>
						</div>
						<!-- User Stats (Desktop) -->
						<div class="user-stats-container hidden md:grid grid-cols-6 gap-2 w-full text-center mt-4">

							<div class="flex flex-col items-center justify-center p-2 bg-black/30 rounded-lg col-span-2">
								<span class="text-xl font-semibold">${userStats.totalWins}</span>
								<span class="text-sm text-gray-400 capitalize " data-i18n="${k('generic.wins')}">Wins</span>
							</div>

							<div class="flex flex-col items-center justify-center p-2 bg-black/30 rounded-lg col-span-2">
								<span class="text-xl font-semibold">${userStats.totalLosses}</span>
								<span class="text-sm text-gray-400 capitalize" data-i18n="${k('generic.losses')}">Losses</span>
							</div>
							<div class="flex flex-col items-center justify-center p-2 bg-black/30 rounded-lg col-span-2">
								<span class="text-xl font-semibold">${userStats.tournamentsWon}</span>
								<span class="text-sm text-gray-400 capitalize" data-i18n="${k('generic.tournaments_won')}">Tournaments Won</span>
							</div>

							<div class="flex flex-col items-center justify-center p-2 bg-black/30 rounded-lg col-span-3">
								<span class="text-xl font-semibold">${userStats.totalGames}</span>
								<span class="text-sm text-gray-400 capitalize" data-i18n="${k('generic.played_games')}">Played Games</span>
							</div>

							<div class="flex flex-col items-center justify-center p-2 bg-black/30 rounded-lg col-span-3">
								<div class="progress-circle" style="--percent:${userStats.winRate};--size:64px;">
									<span>${userStats.winRate}%</span>
								</div>
								<span class="text-sm text-gray-400 capitalize mt-2" data-i18n="${k('generic.win_rate')}">Win Rate</span>
							</div>

						</div>
					</section>
					<section class="flex flex-col md:flex-row grow bg-black md:overflow-hidden">
						<div class="flex flex-col w-full md:w-1/5 min-w-[320px] bg-zinc-950 md:h-full p-2 min-h-32 relative">
							<h4 class="capitalize font-bold" data-i18n="${k('generic.incomming_friend_requests')}">Incomming Friend Requests</h4>
							<!-- FriendRequests will be listed here -->
							<ul id="${this.id}-FriendRequests" class="grow flex flex-col w-full p-2 md:overflow-y-auto">
							</ul>

							<!-- Loading Overlay -->
							${await this.#loadingOverlays.FriendRequests.silentRender()}
						</div>
						<div class="flex flex-col grow p-2 min-h-32 md:overflow-hidden relative">
							<div class="flex gap-1 items-center justify-center py-2">
								<h4 class="capitalize font-bold" data-i18n="${k('generic.last_20_matches')}">Last 20 Matches</h4>
								<span class="hidden last-20-matches-winrate"></span>
							</div>
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
		this.#addFriendForm = document.querySelector(`#${this.id}-add-friend-form`);
		this.#toggleFriendAddButton = document.querySelector(`#${this.id}-add-friend-btn`);
		this.#toggleFriendAddIcon = document.querySelector(`.toggle-friend-add-icon`);
		this.#toggleFriendInput = document.querySelector(`#${this.id}-add-friend-input`);

		this.#toggleFriendAddButton?.addEventListener('click', this.toggleFriendAddClickEvent);
		this.#addFriendForm?.addEventListener('submit', this.handleFriendAddSubmitEvent);


		this.#friendsListContainer = document.querySelector(`#${this.id}-friends-list`);
		this.#baseSocket = authManager.getBaseSocketConnection();
		if (this.#baseSocket) {
			this.#loadingOverlays.pendingFriends.show();
			const currentFriends = authManager.friendsList;
			for (const friend of currentFriends) {
				this.#upsertFriend(friend);
			}
			this.#loadingOverlays.pendingFriends.hide();
			this.#baseSocket.on('friends-list', (friendsList) => {
				console.debug('Friends list updated', friendsList);
				this.#loadingOverlays.pendingFriends.show();
				for (const friend of friendsList) {
					this.#upsertFriend(friend);
				}
				this.#loadingOverlays.pendingFriends.hide();
			});
			this.#baseSocket.on('friend-updated', (friend) => {
				console.debug('Friend updated', friend);
				this.#upsertFriend(friend);
				if (friend.message) {
					toast.success(t('generic.friends'), friend.message);
				}
			});
			this.#baseSocket.on('friend-removed', (data) => {
				console.debug('Friend removed', data);
				this.#removeFriendFromList(data.friendId);
				if (data.message) {
					toast.info(t('generic.friends'), data.message);
					this.#removePendingFriendFromList(data.friendId);
					this.#removeFriendFromList(data.friendId);
					this.#removeFriendFromRequestsList(data.friendId);
				}
			});
			this.#baseSocket.on('friend-request-received', (friendRequest) => {
				console.debug('Friend request received', friendRequest);
				this.#renderFriendRequest(friendRequest);
				if (friendRequest.message) {
					toast.info(t('generic.friend_requests'), friendRequest.message);
				}
			});
			this.#baseSocket.on('friend-request-sent', (data) => {
				console.debug('Friend request sent', data);
				if (data.message) {
					toast.success(t('generic.friend_requests'), data.message);
					this.#upsertPendingFriend(data);
				}
			});
			this.#baseSocket.on('friend-request-accepted', (data) => {
				console.debug('Friend request accepted', data);
				if (data.message) {
					toast.success(t('generic.friend_requests'), data.message);
					this.#removeFriendFromRequestsList(data.friendRelationId);
					this.#removePendingFriendFromList(data.friendRelationId);
				}
			});
			this.#baseSocket.on('friend-request-rejected', (data) => {
				console.debug('Friend request rejected', data);
				if (data.message) {
					toast.info(t('generic.friend_requests'), data.message);
					this.#removePendingFriendFromList(data.friendRelationId);
					this.#removeFriendFromList(data.friendRelationId);
					this.#removeFriendFromRequestsList(data.friendRelationId);
				}
			});
			this.#baseSocket.on('friend-request-rejected-by-me', (data) => {
				console.debug('Friend request rejected by me', data);
				if (data.message) {
					toast.info(t('generic.friend_requests'), data.message);
				}
			});
			this.#baseSocket.on('pending-friend-removed', (data) => {
				console.debug('Pending friend removed', data);
				this.#removePendingFriendFromList(data.friendId);
				this.#removeFriendFromRequestsList(data.friendId);
				if (data.message) {
					toast.info(t('generic.friend_requests'), data.message);
				}
			});
		} else {
			console.warn('No socket connection. Something weird happened...');
		}

		this.#pendingFriendsListContainer = document.querySelector(`#${this.id}-pending-friends-list`);

		this.#updateFriendsCount();


		// FriendRequests
		this.#FriendRequestsContainer = document.querySelector(`#${this.id}-FriendRequests`);
		this.#fetchAndRenderFriendRequests();

		// Last 20 Matches
		this.#last20MatchesContainer = document.querySelector(`#${this.id}-game-history`);
		this.#fetchAndRenderLast20Matches();

		// Friends List
		document.querySelectorAll('.toggle-friends')?.forEach(btn => btn.addEventListener('click', this.toggleFriendsVisibilityClickEvent));

		// Pending Friends
		this.#fetchAndRenderPendingFriends();
		document.querySelectorAll('.toggle-pending-friends')?.forEach(btn => btn.addEventListener('click', this.togglePendingFriendsVisibilityClickEvent));
	}

	async destroy() {
		this.#friendsListContainer?.querySelectorAll('.friend-remove-btn')?.forEach(btn => btn.removeEventListener('click', this.onDeleteFriendClickEvent));

		document.querySelectorAll('.toggle-friends')?.forEach(btn => btn.removeEventListener('click', this.toggleFriendsVisibilityClickEvent));

		document.querySelectorAll('.toggle-pending-friends')?.forEach(btn => btn.removeEventListener('click', this.togglePendingFriendsVisibilityClickEvent));

		const eventsToUnsubscribe = ['friends-list', 'friend-updated', 'friend-removed', 'friend-request-received', 'friend-request-sent', 'friend-request-accepted', 'friend-request-rejected', 'friend-request-rejected-by-me', 'pending-friend-removed']

		if (this.#baseSocket) {
			for (const event of eventsToUnsubscribe) {
				this.#baseSocket.off(event);
			}
		}
	}



	// FRIEND ADD FUNCTIONS ---------------------------------------------------------------------------------------

	#friendAddIsOpen: boolean = false;
	#addFriendForm: HTMLElement | null = null;
	#toggleFriendAddButton: HTMLElement | null = null;
	#toggleFriendAddIcon: HTMLElement | null = null;
	#toggleFriendInput: HTMLInputElement | null = null;


	private toggleFriendAddClickEvent = this.#toggleFriendAdd.bind(this);
	#toggleFriendAdd() {
		this.#friendAddIsOpen = !this.#friendAddIsOpen;
		this.#toggleFriendAddIcon?.classList.toggle('fa-plus', !this.#friendAddIsOpen);
		this.#toggleFriendAddIcon?.classList.toggle('fa-minus', this.#friendAddIsOpen);
		this.#addFriendForm?.classList.toggle('hidden', !this.#friendAddIsOpen);
	}

	private handleFriendAddSubmitEvent = this.#handleFriendAddSubmitEvent.bind(this);
	async #handleFriendAddSubmitEvent(ev: SubmitEvent) {
		ev.preventDefault();
		const username = this.#toggleFriendInput?.value ?? "";

		console.debug('Friend add request for user=', username);
		const request = api.friendship.sendFriendRequest;
		try {
			const result = await request.mutate({ username })

			console.debug('Friend add result=', result);
			this.#toggleFriendInput!.value = '';
		} catch (err) {

			if (err instanceof TRPCClientError) {
				console.warn('Friend add error', err);

				const zodError = err.data?.zodError;
				if (zodError && zodError.fieldErrors) {
					const values = Object.values(zodError.fieldErrors);
					for (const err of values) {
						toast.error(t('generic.add_friend'), err as string);
					}
				} else {
					toast.warn(t('generic.add_friend'), err.message);
					console.debug('Friend add error', err);
				}
			}
		}
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
		const winRateElement = document.querySelector('.last-20-matches-winrate');
		winRateElement?.classList.add('hidden');
		if (matches.length > 0 && winRateElement) {
			const wins = matches.reduce((acc, match) => acc + (match.result === 'W' ? 1 : 0), 0);
			winRateElement.textContent = `(${Math.round(wins / matches.length * 100)}%)`;
			winRateElement.classList.remove('hidden');
		}

		for (const match of matches) {
			const matchElement = document.createElement('li');
			matchElement.className = 'match-item group hover:bg-white/5 transition-colors even:bg-zinc-500/5';
			const myResultClass = match.result === 'W' ? 'text-green-500' : 'text-red-500';
			const myBgClass = match.result === 'W' ? 'bg-green-500/10' : 'bg-red-500/10';
			const mySideIsLeft = match.mySide === 'left';

			matchElement.innerHTML = /*html*/`
			<div class="grid grid-cols-10 items-center px-2 py-3 ${myBgClass}">
				<div class="w-12 text-lg text-center col-span-1">
					<span class="uppercase font-bold ${myResultClass}">${match.result}</span>
				</div>
				<!-- Match Avatar -->
				<div class="grid grid-cols-3 gap-1 items-center col-span-9">
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
		updateDOMTranslations(this.#last20MatchesContainer);
	}
	// END LAST 20 MATCHES FUNCTIONS -------------------------------------------------------------------------------------

	// FRRIENDREQUESTS FUNCTIONS -----------------------------------------------------------------------------------------
	#FriendRequestsContainer: HTMLElement | null = null;
	async #fetchAndRenderFriendRequests() {
		if (!this.#FriendRequestsContainer) return;
		this.#loadingOverlays.FriendRequests.show();
		const pendingFriendsRequests = await api.friendship.getPendingRequests.query();
		this.#renderFriendRequests(pendingFriendsRequests);
		this.#loadingOverlays.FriendRequests.hide();
	}
	#renderFriendRequests(pendingFriendsRequests: RouterOutputs['friendship']['getPendingRequests']) {
		if (!this.#FriendRequestsContainer) return;
		this.#FriendRequestsContainer.innerHTML = ``;
		for (const friendRequest of pendingFriendsRequests) {
			this.#renderFriendRequest(friendRequest);
		}
		if (pendingFriendsRequests.length === 0) {
			this.#FriendRequestsContainer.innerHTML = /*html*/`
				<div class="flex flex-col items-center justify-center w-full grow">
					<span class="text-lg text-gray-400" data-i18n="${k('generic.no_friend_requests')}">Nothing here</span>
				</div>
			`;
		}
		updateDOMTranslations(this.#FriendRequestsContainer);
	}

	#renderFriendRequest(friendRequest: RouterOutputs['friendship']['getPendingRequests'][number]) {
		if (!this.#FriendRequestsContainer) return;

		const friendElement = document.createElement('li');
		friendElement.className = `friend-item group ${isMobile() ? 'even:bg-white/5' : 'hover:bg-white/5'} transition-colors rounded-lg`;
		friendElement.id = `frien-list-item-${friendRequest.id}`;
		friendElement.setAttribute('data-userid', friendRequest.friendRelationId);
		friendElement.setAttribute('data-requestid', friendRequest.id);
		friendElement.innerHTML = /*html*/`
			<div class="flex items-center gap-3 p-2">
				<!-- Friend Avatar -->
				<div class="relative">
					<img src="${getProfilePictureUrlByUserId(friendRequest.friendRelationId)}"
						 alt="${friendRequest.username}'s avatar"
						 class="w-10 h-10 rounded-full object-cover friend-image ring-1 ring-white/10">
				</div>
				<div class="flex flex-col grow">
					<span class="text-sm font-semibold friend-username">${friendRequest.username}</span>
					</div>
				<div class="flex gap-2 ${isMobile() ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity">
					<button title="${t('generic.accept_friend_request') ?? "Accept"}" class="flex justify-center items-center accept-friend-btn rounded-full bg-black w-8 h-8 hover:text-green-500 cursor-pointer">
						<i class="fa fa-check" aria-hidden="true"></i>
					</button>
					<button title="${t('generic.reject_friend_request') ?? "Reject"}" class="flex justify-center items-center reject-friend-btn rounded-full bg-black w-8 h-8 hover:text-red-500 cursor-pointer">
						<i class="fa fa-times" aria-hidden="true"></i>
					</button>
				</div>
			</div>
		`;

		this.#FriendRequestsContainer.appendChild(friendElement);

		friendElement.querySelector('.accept-friend-btn')?.addEventListener('click', () => {
			this.#acceptFriendRequest({ requestId: friendRequest.id })
				.then(result => {
					if (result) {
						friendElement.remove();
					}
				});
		}, { once: true });
		friendElement.querySelector('.reject-friend-btn')?.addEventListener('click', () => {
			this.#rejectFriendRequest({ requestId: friendRequest.id })
				.then(result => {
					if (result) {
						friendElement.remove();
					}
				});
		}, { once: true });
		updateDOMTranslations(this.#FriendRequestsContainer);

	}

	async #acceptFriendRequest(dto: RouterInputs['friendship']['acceptFriendRequest']) {
		try {
			const result = await api.friendship.acceptFriendRequest.mutate(dto);
			console.debug('Friend request accepted', result);
			return true;
		} catch (err) {
			if (err instanceof TRPCClientError) {
				console.warn('Friend accept error', err);
				const zodError = err.data?.zodError;
				if (zodError && zodError.fieldErrors) {
					const values = Object.values(zodError.fieldErrors);
					for (const err of values) {
						toast.error(t('generic.accept_friend_request'), err as string);
					}
				} else {
					toast.warn(t('generic.accept_friend_request'), err.message);
					console.debug('Friend accept error', err);
				}
			}
		}
		return false;
	}
	async #rejectFriendRequest(dto: RouterInputs['friendship']['rejectFriendRequest']) {
		try {
			const result = await api.friendship.rejectFriendRequest.mutate(dto);
			console.debug('Friend request rejected', result);
			return true;
		} catch (err) {
			if (err instanceof TRPCClientError) {
				console.warn('Friend reject error', err);
				const zodError = err.data?.zodError;
				if (zodError && zodError.fieldErrors) {
					const values = Object.values(zodError.fieldErrors);
					for (const err of values) {
						toast.error(t('generic.reject_friend_request'), err as string);
					}
				} else {
					toast.warn(t('generic.reject_friend_request'), err.message);
					console.debug('Friend reject error', err);
				}
			}
		}
		return false;
	}

	#removeFriendFromRequestsList(friendId: string) {
		const friendElement = document.querySelector(`.friend-item[data-userid="${friendId}"]`);
		if (friendElement) {
			friendElement.remove();
			this.#updateFriendsCount();
		}
	}


	// END FRIEND REQUESTS FUNCTIONS -------------------------------------------------------------------------------------


	// FRIEND LIST FUNCTIONS -------------------------------------------------------------------------------------------
	#friendsListVisible: boolean = true;

	private toggleFriendsVisibilityClickEvent = this.#toggleFriendsVisibility.bind(this);
	#toggleFriendsVisibility() {
		const showFriends = document.querySelector('.show-friends');
		const hideFriends = document.querySelector('.hide-friends');

		this.#friendsListVisible = !this.#friendsListVisible;

		showFriends?.classList.toggle('hidden', this.#friendsListVisible);
		hideFriends?.classList.toggle('hidden', !this.#friendsListVisible);
		document.querySelector('.toggle-friends-divider')?.classList.toggle('hidden', !this.#friendsListVisible);

		document.querySelector(`#${this.id}-friends-list`)?.classList.toggle('!hidden', !this.#friendsListVisible);
	}

	#upsertFriend(friend: SocketFriendInfo) {
		const existingFriend = document.querySelector(`#${this.id}-friends-list li[id="friend-${friend!.id}"]`) as HTMLElement | null;
		if (existingFriend) {
			this.#updateFriendFields(friend, existingFriend);
		} else {
			const friendElement = this.#createFriendElement(friend);
			if (friendElement) {
				this.#friendsListContainer?.appendChild(friendElement);

				friendElement.querySelector('.friend-remove-btn')?.addEventListener('click', this.onDeleteFriendClickEvent);
				setTimeout(() => this.#updateFriendsCount(), 0);
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
		if (imageField) {
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

	#removeFriendFromList(friendId: string) {
		const friendElement = document.querySelector(`#friend-${friendId}`);
		if (friendElement) {
			friendElement.remove();
			this.#updateFriendsCount();
		}
	}

	#createFriendElement(friend: SocketFriendInfo) {
		if (!friend) return null;
		const friendElement = document.createElement('li');
		friendElement.id = `friend-${friend.id}`;
		friendElement.setAttribute('data-userid', friend.id);
		friendElement.className = `friend-item group transition-colors rounded-lg ${isMobile() ? 'even:bg-gray-500/5' : ' '} hover:bg-white/5`;
		friendElement.innerHTML = /*html*/`
		<div class="flex items-center gap-3 p-2">
			<!-- Friend Avatar -->
			<div class="relative">
				<a href="/users/${friend.username}" >
					<img src="${getProfilePictureUrlByUserId(friend.id)}"
						alt="${friend.username}'s avatar"
						class="w-10 h-10 rounded-full object-cover friend-image ring-1 ring-white/10">
				</a>
				<div class="friend-status-icon absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-zinc-900
							${friend.state === 'online' ? 'friend-status-icon-online' : 'friend-status-icon-offline'}">
				</div>
			</div>

			<!-- Friend Info -->
			<div class="flex flex-col grow overflow-hidden">
				<span class="text-sm font-semibold friend-username overflow-hidden text-ellipsis line-clamp-1">${friend.username}</span>
				<span class="text-xs text-gray-400 friend-status capitalize" data-i18n="${friend.state === 'online' ? k('generic.online') : k('generic.offline')}">
					${friend.state === 'online' ? t('generic.online') : t('generic.offline')}
				</span>
			</div>

			<!-- Action Buttons ''-->
			<div class="flex gap-2 ${isMobile() ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity'}">
				<button class="friend-remove-btn text-red-600 hover:text-red-700 active:text-red-500 py-1 px-2 cursor-pointer rounded-full hover:bg-white/10 transition-colors ">
					<i class="fa fa-ban" aria-hidden="true"></i>
				</button>
			</div>
		</div>
	`;
		return friendElement;
	}

	private onDeleteFriendClickEvent = this.#onDeleteFriendClick.bind(this);

	#onDeleteFriendClick(event: Event) {
		console.debug('Friend action button clicked', event);
		const target = event.target as HTMLElement;
		const friendElement = target.closest('.friend-item');
		if (!friendElement) {
			console.debug('Friend action button clicked, but no friend element found');
			return;
		};
		const friendId = friendElement.getAttribute('data-userid');
		if (!friendId) {
			console.debug('Friend action button clicked, but no friend id found');
			return;
		}
		ConfirmModal.create({
			title: t('generic.remove_friend') ?? "Remove Friend",
			message: t('generic.remove_friend_confirm', { username: friendElement.querySelector('.friend-username')?.textContent ?? '' }) ?? "Are you sure you want to remove this friend from your friends list? This action cannot be undone.",
			onConfirm: async () => {
				console.debug('Friend remove confirmed', friendId);
				try {
					await api.friendship.removeFriend.mutate({ friendId });
				} catch (err) {
					console.error('Friend remove error', err);
					if (err instanceof TRPCClientError) {
						console.warn('Friend remove error', err);
						const zodError = err.data?.zodError;
						if (zodError && zodError.fieldErrors) {
							const values = Object.values(zodError.fieldErrors);
							for (const err of values) {
								toast.error(t('generic.remove_friend'), err as string);
							}
						} else {
							toast.warn(t('generic.remove_friend'), err.message);
							console.debug('Friend remove error', err);
						}
					}
				}
			}
		});

	}

	// END FRIEND LIST FUNCTIONS ---------------------------------------------------------------------------------------
	// START PENDING FRIENDS FUNCTIONS ---------------------------------------------------------------------------------
	#pendingFriendsListContainer: HTMLElement | null = null;
	#pendingFriendsVisible: boolean = true;



	async #fetchAndRenderPendingFriends() {
		this.#loadingOverlays.pendingFriends.show();
		const pendingFriends = await api.friendship.getSentRequests.query();
		console.debug('Pending friends', pendingFriends);

		for (const friend of pendingFriends) {
			this.#upsertPendingFriend(friend);
		}

		this.#loadingOverlays.pendingFriends.hide();
	}

	private togglePendingFriendsVisibilityClickEvent = this.#togglePendingFriendsVisibility.bind(this);
	#togglePendingFriendsVisibility() {
		const showPendingFriends = document.querySelector('.show-pending-friends');
		const hidePendingFriends = document.querySelector('.hide-pending-friends');

		this.#pendingFriendsVisible = !this.#pendingFriendsVisible;

		showPendingFriends?.classList.toggle('hidden', this.#pendingFriendsVisible);
		hidePendingFriends?.classList.toggle('hidden', !this.#pendingFriendsVisible);
		document.querySelector('.toggle-pending-friends-divider')?.classList.toggle('hidden', !this.#pendingFriendsVisible);

		document.querySelector(`#${this.id}-pending-friends-list`)?.classList.toggle('!hidden', !this.#pendingFriendsVisible);
	}



	#upsertPendingFriend(friend: RouterOutputs['friendship']['getSentRequests'][number]) {
		const existingFriend = document.querySelector(`#${this.id}-pending-friends-list li[id="pending-friend-${friend!.id}"]`) as HTMLElement | null;
		if (existingFriend) {
			this.#updatePendingFriendFields(friend, existingFriend);
		} else {
			const friendElement = this.#createPendingFriendElement(friend);
			if (friendElement) {
				this.#pendingFriendsListContainer?.appendChild(friendElement);

				friendElement.querySelector('.pending-friend-remove-btn')?.addEventListener('click', this.onDeletePendingFriendClickEvent);
			}
		}
	}

	#updatePendingFriendFields(friend: RouterOutputs['friendship']['getSentRequests'][number], friendElement: HTMLElement) {
		if (!friend) return null;

		const usernameField = friendElement.querySelector('.friend-username');
		if (usernameField) {
			usernameField.textContent = friend.username;
		}

		const imageField = friendElement.querySelector('.friend-image') as HTMLImageElement;
		if (imageField) {
			imageField.src = getProfilePictureUrlByUserId(friend.id);
		}
	}

	#createPendingFriendElement(friend: RouterOutputs['friendship']['getSentRequests'][number]) {
		if (!friend) return null;
		const friendElement = document.createElement('li');
		friendElement.id = `pending-friend-${friend.id}`;
		friendElement.setAttribute('data-userid', friend.friendRelationId);
		friendElement.setAttribute('data-requestid', friend.id);
		friendElement.className = `pending-friend-item group transition-colors rounded-lg ${isMobile() ? 'even:bg-gray-500/5' : ' '} hover:bg-white/5`;
		friendElement.innerHTML = /*html*/`
		<div class="flex items-center gap-3 p-2">
			<!-- Friend Avatar -->
			<div class="relative">
				<a href="/users/${friend.username}" >
					<img src="${getProfilePictureUrlByUserId(friend.friendRelationId)}"
						alt="${friend.username}'s avatar"
						class="w-10 h-10 rounded-full object-cover friend-image ring-1 ring-white/10">
				</a>
			</div>

			<!-- Friend Info -->
			<div class="flex flex-col grow">
				<span class="text-sm font-semibold friend-username">${friend.username}</span>
			</div>

			<!-- Action Buttons ''-->
			<div class="flex gap-2 ${isMobile() ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity'}">
				<button class="pending-friend-remove-btn text-red-600 hover:text-red-700 active:text-red-500 py-1 px-2 cursor-pointer rounded-full hover:bg-white/10 transition-colors ">
					<i class="fa fa-times" aria-hidden="true"></i>
				</button>
			</div>
		</div>
	`;

		return friendElement;
	}


	private onDeletePendingFriendClickEvent = this.#onDeletePendingFriendClick.bind(this);
	#onDeletePendingFriendClick(event: Event) {
		console.debug('Pending Friend delete button clicked', event);
		const target = event.target as HTMLElement;
		const friendElement = target.closest('.pending-friend-item');
		if (!friendElement) {
			console.debug('Pending Friend button clicked, but no friend element found');
			return;
		};
		const friendId = friendElement.getAttribute('data-userid');
		if (!friendId) {
			console.debug('Pending Friend button clicked, but no friend id found');
			return;
		}
		const friendRequestId = friendElement.getAttribute('data-requestid');
		if (!friendRequestId) {
			console.debug('Pending Friend button clicked, but no friend request id found');
			return;
		}

		ConfirmModal.create({
			title: t('generic.cancel_friend_request') ?? "Cancel Friend Request",
			message: t('generic.cancel_friend_request_confirm', { username: friendElement.querySelector('.friend-username')?.textContent ?? '' }) ?? "Are you sure you want to cancel this friend request from your friends list? This action cannot be undone.",
			onConfirm: async () => {
				try {
					await api.friendship.removePendingFriend.mutate({ friendId: friendId });
					friendElement.remove();
					this.#updateFriendsCount();
				} catch (err) {
					console.error('Friend remove error', err);
					if (err instanceof TRPCClientError) {
						console.warn('Friend remove error', err);
						const zodError = err.data?.zodError;
						if (zodError && zodError.fieldErrors) {
							const values = Object.values(zodError.fieldErrors);
							for (const err of values) {
								toast.error(t('generic.remove_friend'), err as string);
							}
						} else {
							toast.warn(t('generic.remove_friend'), err.message);
							console.debug('Friend remove error', err);
						}
					}
				}
			}
		});

	}


	#removePendingFriendFromList(friendId: string) {
		const friendElement = document.querySelector(`.pending-friend-item[data-userid="${friendId}"]`);
		if (friendElement) {
			friendElement.remove();
			this.#updateFriendsCount();
		}
	}

	// END PENDING FRIENDS FUNCTIONS -----------------------------------------------------------------------------------

}
