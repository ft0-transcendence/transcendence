import { api } from "../../main";
import { RouteController } from "@tools/ViewController";
import { router } from "./_router";
import { authManager } from "@tools/AuthManager";
import toast from "@tools/Toast";
import { RouterOutputs, SocketFriendInfo } from "@shared";
import { k, t, updateDOMTranslations } from "@src/tools/i18n";

export class HomeController extends RouteController {
	constructor() {
		super();
		this.titleSuffix = 'Home';
	}
	#handleFriendActionClickEvent = this.handleUserActionClickEvent.bind(this);

	#friendsListContainer: HTMLElement | null = null;

	async preRender() {
		console.log('Home controller pre-render');
	}

	async render() {
		const userData = authManager.user;

		return /*html*/`
		<div class="flex flex-col w-full grow">
			<div class="flex flex-col items-center w-full grow md:grid md:grid-cols-5">
				<div class="flex flex-col items-center w-full text-center md:h-full md:col-span-1 bg-zinc-900/50">
					<!-- User Profile -->
					<div class="flex flex-col items-center w-full gap-4 p-6 border-b border-b-white/15 bg-zinc-800/50">
						<div class="relative">
							<img src="${authManager.userImageUrl}"
								 alt="User image"
								 class="user-image w-24 h-24 rounded-full aspect-square object-cover shrink-0 ring-2 ring-amber-500/50 ring-offset-zinc-900">
							<div class="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-green-500 border-2 border-zinc-900"></div>
						</div>
						<div class="text-xl font-bold user-username">${userData?.username}</div>
					</div>

					<!-- Friends List -->
					<div class="flex flex-col w-full grow p-4 border-b border-white/15 sm:border-none">
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
				<div class="flex flex-col w-full gap-8 p-4 text-center md:h-full md:col-span-4 md:border-l md:border-l-white/30">
					<h2 class="font-mono text-2xl font-bold uppercase">Match History</h2>
					<div class="flex flex-col gap-2">
						<span class="text-xl animate-bounce">WIP...</span>
					</div>
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
		const friendsMock: SocketFriendInfo[] = [
			{ id: '1', username: 'Leo (mock)', state: 'online', imageUrl: 'https://picsum.photos/id/10/200/200', imageBlob: null, imageBlobMimeType: null, email: 'leo@example.com', createdAt: new Date() },
			{ id: '2', username: 'Pasquale (mock)', state: 'online', imageUrl: 'https://picsum.photos/id/100/200/200', imageBlob: null, imageBlobMimeType: null, email: 'pasquale@example.com', createdAt: new Date() },
			{ id: '3', username: 'Luca (mock)', state: 'offline', imageUrl: 'https://picsum.photos/id/101/200/200', imageBlob: null, imageBlobMimeType: null, email: 'luca@example.com', createdAt: new Date() },
			{ id: '4', username: 'Giulia (mock)', state: 'online', imageUrl: 'https://picsum.photos/id/102/200/200', imageBlob: null, imageBlobMimeType: null, email: 'giulia@example.com', createdAt: new Date() },
		]
		for (const friend of friendsMock) {
			console.debug('Friend mock', friend);
			this.#upsertFriend(friend);
		}

		setTimeout(() => {
			friendsMock[0].state = 'offline';
			this.#upsertFriend(friendsMock[0]);
		}, 10000);
		// TODO: REMOVE THIS MOCK DATA------------------------

		this.#updateFriendsCount();

		document.addEventListener('click', this.#handleFriendActionClickEvent);
	}

	async destroy() {
		document.removeEventListener('click', this.#handleFriendActionClickEvent);
	}

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
		if (imageField) {
			let src = friend.imageUrl;
			if (friend.imageBlob) {
				const uint8Array = new Uint8Array(friend.imageBlob) as unknown as ArrayBuffer;
				const blob = new Blob([uint8Array], { type: friend.imageBlobMimeType ?? "image/png" });
				src = URL.createObjectURL(blob);
			}
			imageField.src = src!;
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
				<img src="${friend.imageUrl}"
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

}
