import { api } from "@main";
import { RouterOutputs } from "@shared";
import { LoadingOverlay } from "@src/components/LoadingOverlay";
import { router } from "@src/pages/_router";
import { k, t, updateDOMTranslations } from "@src/tools/i18n";
import toast from "@src/tools/Toast";
import { RouteController } from "@src/tools/ViewController";
import { getProfilePictureUrlByUserId } from "@src/utils/getImage";
import { TRPCClientError } from "@trpc/client";
import he from 'he';

export class TournamentsListController extends RouteController {

	constructor(){
		super();
		this.updateTitleSuffix();
	}
	override updateTitleSuffix() {
		this.titleSuffix = t('navbar.online_tournaments') ?? "Tournaments";
	}

	#loadingOverlays = {
		tournamentList: new LoadingOverlay()
	};

	#countdownInterval: NodeJS.Timeout | null = null;

	protected async preRender() {
		this.registerChildComponent(this.#loadingOverlays.tournamentList);
	}

	protected async render() {
		return /*html*/`
		<div class="flex flex-col relative grow bg-neutral-900">
			<header class="sticky top-0 right-0 z-10 bg-black/50 flex items-center py-3 px-6 w-full gap-2">
				<h1 class="text-xl md:text-2xl font-bold" data-i18n="${k('generic.tournaments')}">Tournaments</h1>

				<div class="grow"></div>
				<div class="flex justify-end">
					<button id="${this.id}-create-tournament-btn"
							class="px-2 py-1 md:px-4 md:py-2 text-sm md:text-xl rounded-md bg-stone-600 hover:bg-stone-500 cursor-pointer transition-colors text-white font-semibold drop-shadow-lg drop-shadow-black flex items-center gap-2"
							aria-label="Create Tournament" title="Create Tournament">
						<i class="fa fa-plus"></i>
						<span class="flex" data-i18n="${k('generic.create_tournament')}">Create Tournament</span>
					</button>
				</div>
			</header>
			<div class="relative grow flex flex-col items-center w-full px-4 py-2">
				<ul id="${this.id}-tournaments-list"
					class="w-full max-w-5xl flex flex-col gap-3 items-center grow overflow-y-auto px-2">
				</ul>
			</div>

			${await this.#loadingOverlays.tournamentList.silentRender()}


			<div id="${this.id}-create-tournament-modal" class="fixed inset-0 z-40 hidden items-center justify-center">
				<div class="absolute inset-0 bg-black/80 backdrop-blur-sm" data-modal-backdrop></div>
				<div class="relative z-50 w-full max-w-md mx-4 bg-neutral-900 rounded-lg p-5 shadow-xl">
					<h3 class="text-lg font-semibold mb-3" data-i18n="${k('generic.create_tournament')}">Create Tournament</h3>
					<form id="${this.id}-create-tournament-form" class="flex flex-col gap-3 text-white">
						<label for="${this.id}-tournament-name" class="text-sm text-gray-300" data-i18n="${k('generic.tournament_name')}">Tournament name</label>
						<input id="${this.id}-tournament-name" type="text"
								class="w-full bg-neutral-600/20 text-white p-2 rounded-md border border-white/5 focus-within:ring-1 focus-within:ring-amber-400"
								placeholder="My Tournament" required data-placeholder-i18n="${k('generic.tournament_name_placeholder')}" />

						<label for="${this.id}-tournament-start" class="text-sm text-gray-300" data-i18n="${k('generic.start_date_and_time')}">Start date & time</label>
						<input id="${this.id}-tournament-start" type="datetime-local"
								class="w-full bg-neutral-600/20 text-white p-2 rounded-md border border-white/5 focus-within:ring-1 focus-within:ring-amber-400"
								required />

						<div class="flex items-center justify-between">
							<div class="text-sm text-gray-300" data-i18n="${k('generic.max_participants')}">Max participants</div>
							<div class="text-sm font-semibold px-5">8</div>
						</div>

						<div class="flex gap-2 justify-end mt-2">
							<button type="button" id="${this.id}-create-modal-cancel"
									class="px-3 py-1 rounded-md bg-black/50 hover:bg-black/75 transition-colors cursor-pointer" data-i18n="${k('generic.cancel')}">Cancel</button>
							<button type="submit" id="${this.id}-create-modal-submit"
									class="px-3 py-1 rounded-md bg-amber-500 hover:bg-amber-400 transition-colors text-black font-semibold cursor-pointer" data-i18n="${k('generic.create')}">Create</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	`;
	}

	protected async postRender() {
		this.#fetchAndShowTournaments();
		this.#bindOnCreateTournamentModalOpen();
	}

	async #fetchAndShowTournaments() {
		this.#loadingOverlays.tournamentList.show();
		try {
			const tournaments = await api.tournament.getAvailableTournaments.query();
			const listEl = document.querySelector(`#${this.id}-tournaments-list`);
			if (!listEl) return;
			listEl.innerHTML = '';
			tournaments.forEach(t => listEl.appendChild(this.#createTournamentItem(t)));

			this.#stopCountdownUpdater();
			this.#startCountdownUpdater();
		} catch (err) {
			console.error('[Tournaments] fetch error', err);
		} finally {
			this.#loadingOverlays.tournamentList.hide();
		}
	}

	#createTournamentItem(tournament: RouterOutputs['tournament']['getAvailableTournaments'][number]) {
		const li = document.createElement('li');
		li.className = `
			w-full bg-neutral-800 hover:bg-neutral-700 rounded-lg shadow-md hover:shadow-lg transition-shadow
			overflow-hidden cursor-pointer flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 sm:p-4
		`;
		li.setAttribute('data-tournament-id', tournament.id);

		const isWaiting = tournament.status === 'WAITING_PLAYERS';
		const isFull = (tournament.maxParticipants ?? 8) <= (tournament.participantsCount ?? 0);
		const isJoinable = isWaiting && !isFull;
		const statusClass = isJoinable ? 'bg-green-600' : (isFull ? 'bg-red-700' : 'bg-yellow-600');

		const startDate = tournament.startDate ? new Date(tournament.startDate) : null;
		const startTooltip = startDate ? startDate.toLocaleString('en-US', {
			year: 'numeric', month: '2-digit', day: '2-digit',
			hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
		}) : 'N/A';
		const remainingText = startDate ? this.#formatRemainingTime(startDate) : '—';

		const createdByInitials = tournament.createdBy.username.split(/[\s_]+/).map(s => s[0]).join('');

		const joinedUsersTooltip = tournament.participants.map(p => p.username).join(', ')?.replace(/["']/g, '');

		li.innerHTML = /*html*/`
		<a data-route="/play/online/tournaments/${tournament.id}" href="/play/online/tournaments/${tournament.id}"
			class="flex flex-col w-full gap-3">
			<div class="flex flex-col sm:flex-row gap-2">
			<!-- Avatar -->
				<div class="flex-shrink-0 flex w-full sm:w-auto gap-2">
					<img src="${getProfilePictureUrlByUserId(tournament.createdBy.id)}"
						alt="${createdByInitials.toUpperCase()}"
						class="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover ring-1 ring-white/10">
					<div class="flex flex-col min-w-0 grow">
						<div class="text-sm sm:text-lg font-semibold truncate">${he.escape(tournament.name)}</div>
						<div class="text-xs text-stone-300 truncate">by ${tournament.createdBy.username}</div>
					</div>
				</div>

				<div class="hidden sm:block sm:grow"></div>

				<!-- Content -->
				<div class="flex flex-col sm:flex-col sm:items-center sm:justify-between min-w-0 gap-1">

					<div class="flex gap-2 items-center sm:justify-start sm:flex-col sm:gap-1">
						<div ${tournament.hasUserJoined ? 'disabled' : ''}
							data-i18n="${k('generic.tournamentList.join')}"
							class="${!isJoinable || tournament.hasUserJoined ? 'hidden' : 'cursor-pointer'} join-tournament-btn px-5 py-2.5 uppercase rounded-md bg-stone-600 hover:bg-stone-500 transition-colors text-sm font-semibold text-center min-w-24">
							Join
						</div>
						<div ${tournament.hasUserJoined ? 'disabled' : ''}
							data-i18n="${k('generic.tournamentList.leave')}"
							class="${!isJoinable || !tournament.hasUserJoined ? 'hidden' : ''} leave-tournament-btn px-5 py-2.5 uppercase rounded-md bg-red-700 hover:bg-red-600 transition-colors text-sm font-semibold text-center min-w-24">
							Leave
						</div>
					</div>
				</div>

			</div>

			<div class="flex flex-wrap gap-4 text-xs md:text-sm text-stone-300 mt-1">
				<div class="flex items-center gap-1">
					<i class="fa fa-users text-stone-400"></i>
					<span class="font-mono" title="${joinedUsersTooltip ?? 'n/a'}">
						${tournament.participantsCount ?? 0}
						/
						${tournament.maxParticipants ?? 8}
					</span>
				</div>
				<div class="flex items-center gap-1" data-start-tooltip="${startTooltip}" title="${startTooltip}">
					<i class="fa fa-clock-o text-stone-400"></i>
					<span class="tournament-countdown font-mono text-sm">${remainingText}</span>
				</div>
				<div class="text-xs text-white px-2 py-1 rounded-full ${statusClass} font-semibold text-center w-fit">
					${tournament.status.replace('_', ' ')}
				</div>
			</div>
		</a>
		`;

		const joinBtn = li.querySelector('.join-tournament-btn') as HTMLButtonElement | null;
		const leaveBtn = li.querySelector('.leave-tournament-btn') as HTMLButtonElement | null;

		if (joinBtn) {
			joinBtn.addEventListener('click', async (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
				if (tournament.hasUserJoined) {
					toast.info(t('generic.join_tournament'), t('generic.already_joined_troll_description') ?? "");
					return;
				}
				try {
					await api.tournament.joinTournament.mutate({ tournamentId: tournament.id });
					joinBtn.remove();
					router.navigate(`/play/online/tournaments/${tournament.id}`);
				} catch (err) {
					if (err instanceof TRPCClientError) {
						const msg = err.data?.zodError?.fieldErrors ? Object.values(err.data.zodError.fieldErrors).join(', ') : err.message;
						toast.error(t('generic.join_tournament'), msg);
					} else {
						toast.error(t('generic.join_tournament'), t('error.generic_server_error') ?? "");
					}
				}
			});
		}
		if (leaveBtn) {
			leaveBtn.addEventListener('click', async (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
				if (!tournament.hasUserJoined) {
					toast.info(t('generic.leave_tournament'), t('generic.already_left_troll_description') ?? "");
					return;
				}
				try {
					await api.tournament.leaveTournament.mutate({ tournamentId: tournament.id });
					toast.info(t('generic.leave_tournament'), t('generic.leave_tournament_success') ?? "");
					this.#fetchAndShowTournaments();
				} catch (err) {
					if (err instanceof TRPCClientError) {
						const msg = err.data?.zodError?.fieldErrors ? Object.values(err.data.zodError.fieldErrors).join(', ') : err.message;
						toast.error(t('generic.leave_tournament'), msg);
					} else {
						toast.error(t('generic.leave_tournament'), t('error.generic_server_error') ?? "");
					}
				}
			});
		}
		updateDOMTranslations(li);

		return li;
	}

	#formatRemainingTime(futureDate: Date) {
		const now = new Date();
		const diff = futureDate.getTime() - now.getTime();
		if (diff <= 0) return t('generic.countdown.started');

		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return futureDate.toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
		if (hours >= 1) return t('generic.countdown.hours_minutes', { hours, minutes: minutes % 60 });
		return t('generic.countdown.minutes_seconds', { minutes, seconds: seconds % 60 });
	}

	#startCountdownUpdater() {
		const update = () => {
			document.querySelectorAll(`#${this.id}-tournaments-list .tournament-countdown`).forEach(el => {
				const parent = el.closest('li');
				if (!parent) return;
				const titleContainer = parent.querySelector('[data-start-tooltip]') as HTMLElement | null;
				if (!titleContainer) return;
				const date = new Date(titleContainer.getAttribute('data-start-tooltip')!);
				el.textContent = this.#formatRemainingTime(date);

			});
			this.#countdownInterval = setTimeout(update, 60 * 1000);
		};
		update();
	}

	#stopCountdownUpdater() {
		if (this.#countdownInterval) clearTimeout(this.#countdownInterval);
		this.#countdownInterval = null;
	}

	#bindOnCreateTournamentModalOpen() {
		const fab = document.querySelector(`#${this.id}-create-tournament-btn`);
		const modal = document.querySelector(`#${this.id}-create-tournament-modal`);
		const backdrop = modal?.querySelector('[data-modal-backdrop]');
		const cancelBtn = document.querySelector(`#${this.id}-create-modal-cancel`);
		const form = document.querySelector(`#${this.id}-create-tournament-form`) as HTMLFormElement | null;
		let startInput = document.querySelector(`#${this.id}-tournament-start`) as HTMLInputElement | null;


		const openModal = () => {
			modal?.classList.remove('hidden');
			modal?.classList.add('flex');
			setTimeout(() => {
				(document.querySelector(`#${this.id}-tournament-name`) as HTMLInputElement)?.focus()
			}, 50);
		};
		const closeModal = () => { modal?.classList.add('hidden'); modal?.classList.remove('flex'); form?.reset(); };

		fab?.addEventListener('click', openModal);
		cancelBtn?.addEventListener('click', closeModal);
		backdrop?.addEventListener('click', closeModal);

		form?.addEventListener('submit', async (ev) => {
			ev.preventDefault();
			const nameInput = document.querySelector(`#${this.id}-tournament-name`) as HTMLInputElement | null;
			if (!nameInput || !startInput) return;

			const dto = { name: nameInput.value, startDate: new Date(startInput.value).toISOString(), maxParticipants: 8 };

			try {
				const res = await api.tournament.createTournament.mutate({ name: dto.name, type: "EIGHT", startDate: dto.startDate });
				closeModal();
				this.#fetchAndShowTournaments();
				router.navigate(`/play/online/tournaments/${res.id}`);
			} catch (err) {
				if (err instanceof TRPCClientError) {
					const msg = err.data?.zodError?.fieldErrors ? Object.values(err.data.zodError.fieldErrors).join(', ') : err.message;
					toast.error(t('generic.create_tournament'), msg);
				} else {
					toast.error(t('generic.create_tournament'), t('error.generic_server_error') ?? "");
				}
			}
		});
	}

	async destroy() {
		this.#stopCountdownUpdater();
		['#create-tournament-fab', '#create-tournament-modal'].forEach(sel => {
			const el = document.querySelector(sel);
			if (el) el.replaceWith(el.cloneNode(true));
		});
		this.#loadingOverlays.tournamentList.hide();
	}
}
