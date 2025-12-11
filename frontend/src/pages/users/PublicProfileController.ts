import { api } from "../../../main";
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
import { showAndLogTrpcError } from "@src/utils/trpcResponseUtils";

export class PublicProfileController extends RouteController {
	#username: string;

	#userDto: RouterOutputs['user']['publicProfileByUsername'] | null = null;
	#userStats: RouterOutputs['user']['getUserStats'] | null = null;


	#loadingOverlays: {
		incomingFriendRequests: LoadingOverlay,
		sentFriendRequests: LoadingOverlay,
		last20Matches: LoadingOverlay,
	} = {
			incomingFriendRequests: new LoadingOverlay('FriendRequests'),
			sentFriendRequests: new LoadingOverlay('sent-friend-requests'),
			last20Matches: new LoadingOverlay('last-20-matches'),
		}


	constructor(params?: Record<string, string>) {
		super(params);
		this.titleSuffix = 'Home';
		this.#username = params?.username ?? '';
		this.registerChildComponent(this.#loadingOverlays.incomingFriendRequests);
		this.registerChildComponent(this.#loadingOverlays.last20Matches);
		this.registerChildComponent(this.#loadingOverlays.sentFriendRequests);
	}



	async preRender() {
		try {
			this.#userDto = await api.user.publicProfileByUsername.query({ username: this.#username });
			this.#userStats = await api.user.getUserStats.query({id: this.#userDto?.id});
		} catch (err) {
			console.error('Failed to load user profile:', err);
			showAndLogTrpcError(err, 'generic.user_profile');
		}
	}

	#renderNotFound() {
		return /*html*/ `
		<div class="flex flex-col items-center justify-center text-3xl grow">
			<h1 class="text-2xl uppercase font-mono font-bold" data-i18n="${k("generic.user_profile")}">User profile</h1>
			<a data-route="/home" href="/home"
				class="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-400 transition-colors">
				<i class="fa fa-arrow-left"></i>
				<span class="ml-1" data-i18n="${k("generic.go_back")}">Go back</span>
			</a>
		</div>
		`;
	}

	async render() {
		if (!this.#userDto || !this.#userStats) return this.#renderNotFound();
		const userData = this.#userDto;

		const userStats = this.#userStats;

		return /*html*/`
		<div class="flex flex-col w-full grow md:overflow-hidden">
			<div class="flex flex-col items-center w-full grow md:grid md:grid-cols-5 overflow-hidden">
				<div class="flex flex-col items-center overflow-y-auto md:overflow-y-hidden md:hidden md:overflow-hidden w-full bg-zinc-900/50 overflow-hidden shrink-0">
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
									<span style="font-size: 0.69rem;">${userStats.winRate}%</span>
								</div>
								<div class="text-xs text-gray-400 capitalize mt-1" data-i18n="${k('generic.win_rate')}">Win Rate</div>
							</div>
						</div>
					</div>
				</div>

				<!-- content -->
				<div class="grow flex flex-col w-full text-center md:h-full md:col-span-5 md:border-l md:border-l-white/15 md:overflow-hidden">
					<!-- User Profile -->
					<section class="hidden md:flex justify-start gap-4 items-center px-6 py-3 border-b border-b-white/15 shrink-0 relative overflow-x-auto">
						<div class="flex flex-col justify-start border-b-white/15 gap-2">
							<div class="relative w-24 h-24 flex items-center justify-center">
								<img src="${getProfilePictureUrlByUserId(userData.id)}"
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
					<section class="flex flex-col md:flex-row grow md:overflow-hidden">
						<div class="flex flex-col grow p-2 min-h-32 md:overflow-hidden relative bg-black">
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

		// Last 20 Matches
		this.#last20MatchesContainer = document.querySelector(`#${this.id}-game-history`);
		this.#fetchAndRenderLast20Matches();

	}

	async destroy() {

		const socketEventsToUnsubscribe = ['friends-list', 'friend-updated', 'friend-removed', 'friend-request-received', 'friend-request-sent', 'friend-request-accepted', 'friend-request-rejected', 'friend-request-rejected-by-me', 'pending-friend-removed']

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
			showAndLogTrpcError(err, 'generic.add_friend');
		}
	}


	// START LAST 20 MATCHES FUNCTIONS ---------------------------------------------------------------------------------------
	#last20MatchesContainer: HTMLElement | null = null;
	async #fetchAndRenderLast20Matches() {
		if (!this.#last20MatchesContainer) return;
		this.#loadingOverlays.last20Matches.show();
		const matches = await api.game.lastNMatches.query({ quantity: 20, userId: this.#userDto?.id });
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
						 alt="${match?.leftPlayerUsername ?? match.leftPlayer.username}'s avatar"
						 class="w-10 h-10 rounded-full object-cover match-image ring-1 ring-white/10">
						<span>${match?.leftPlayerUsername ?? match.leftPlayer.username}</span>
					</div>
					<div class="text-lg font-bold">
						<span class="${mySideIsLeft ? myResultClass : ''}">${match.leftPlayerScore}</span>
						<span>:</span>
						<span class="${!mySideIsLeft ? myResultClass : ''}">${match.rightPlayerScore}</span>
					</div>
					<div class="flex flex-col justify-center items-center gap-1 text-sm">
						<img src="${getProfilePictureUrlByUserId(match.rightPlayer.id)}"
						 alt="${match?.rightPlayerUsername ?? match.rightPlayer.username}"
						 class="w-10 h-10 rounded-full object-cover match-image ring-1 ring-white/10">
						 <span>${match?.rightPlayerUsername ?? match.rightPlayer.username}</span>
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
}
