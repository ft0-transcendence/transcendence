import { api } from "@main";
import { RouterOutputs, TournamentRoundType } from "@shared";
import { k, t, updateDOMTranslations } from "@src/tools/i18n";
import toast from "@src/tools/Toast";
import { RouteController } from "@src/tools/ViewController";
import { router } from "@src/pages/_router";
import { getProfilePictureUrlByUserId } from "@src/utils/getImage";
import { TRPCClientError } from "@trpc/client";
import { authManager } from "@src/tools/AuthManager";
import { LoadingOverlay } from "@src/components/LoadingOverlay";
import he from 'he';
import { io, Socket } from "socket.io-client";
import { ConfirmModal } from "@src/tools/ConfirmModal";
import { showAndLogTrpcError } from "@src/utils/trpcResponseUtils";

type TournamentDTO = NonNullable<RouterOutputs["tournament"]["getTournamentDetails"]>;
type TournamentGame = NonNullable<TournamentDTO["games"]>[number];

// TODO: it's a little messy, refactor this
export class OnlineTournamentDetailsController extends RouteController {
	#tournamentId: string = "";
	#tournamentDto: RouterOutputs["tournament"]["getTournamentDetails"] | null = null;

	#tournamentNamespace: Socket | null = null;

	#isDeletingTournament = false;

	#loadingOverlays = {
		root: new LoadingOverlay(),
	}

	constructor(params: Record<string, string> | undefined = undefined) {
		super(params);
		this.#tournamentId = this.params.tournamentId;
		this.updateTitleSuffix();
	}

	override updateTitleSuffix() {
		if (this.#tournamentDto) {
			this.titleSuffix = `${this.#tournamentDto.name} - ${t("generic.tournament")}`;
		} else {
			this.titleSuffix = `#${this.#tournamentId}`;
		}
	}

	protected async preRender() {
		this.registerChildComponent(this.#loadingOverlays.root);
		console.debug('[TournamentDetails] Loading tournament with ID:', this.#tournamentId);
		try {
			this.#tournamentDto = await api.tournament.getTournamentDetails.query({ tournamentId: this.#tournamentId });
			console.debug('[TournamentDetails] Tournament loaded successfully:', this.#tournamentDto);
		} catch (err) {
			console.error('[TournamentDetails] Failed to load tournament:', err);
			showAndLogTrpcError(err, 'generic.tournament');
		}
		this.updateTitleSuffix();
	}

	#renderNotFound() {
		return /*html*/ `
		<div class="flex flex-col items-center justify-center text-3xl grow">
			<h1 class="text-2xl uppercase font-mono font-bold" data-i18n="${k("generic.tournament_not_found")}">Tournament not found</h1>
			<a data-route="/play/online/tournaments" href="/play/online/tournaments"
				class="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-400 transition-colors">
				<i class="fa fa-arrow-left"></i>
				<span class="ml-1" data-i18n="${k("generic.go_back")}">Go back</span>
			</a>
		</div>
		`;
	}

	#getTournamentStatusBadgeColorClass(status: RouterOutputs["tournament"]["getTournamentDetails"]["status"]) {
		const statusColor = status === "IN_PROGRESS" ? "bg-amber-500 text-black" : status === "WAITING_PLAYERS" ? "bg-green-600 text-white" : "bg-red-700 text-white";
		return statusColor;
	}

	protected async render() {
		if (!this.#tournamentDto) return this.#renderNotFound();

		console.debug('Rendering tournament details page. Tournament: ', this.#tournamentDto);

		const tDto = this.#tournamentDto;
		const startDate = tDto.startDate ? new Date(tDto.startDate).toLocaleString() : null;

		const isCreator = authManager.user?.id === tDto.createdBy?.id;
		const canStart = isCreator && tDto.status === 'WAITING_PLAYERS';
		const canDelete = isCreator && tDto.status !== 'COMPLETED';
		const statusColor = this.#getTournamentStatusBadgeColorClass(tDto.status);

		console.debug('Tournament button visibility:', {
			currentUserId: authManager.user?.id,
			creatorId: tDto.createdBy?.id,
			isCreator,
			status: tDto.status,
			canStart,
			canDelete
		});

		return /*html*/ `
			<div class="flex flex-col grow bg-neutral-900 text-white">
				<header class="sticky top-0 right-0 z-10 bg-black/50 flex items-center py-3 px-6 w-full">
					<a data-route="/play/online/tournaments" href="/play/online/tournaments"
						class="text-stone-400 hover:text-stone-200 transition-colors flex items-center gap-2">
						<i class="fa fa-arrow-left"></i>
						<span data-i18n="${k("generic.back_to_list")}">Back to list</span>
					</a>
					<div class="grow"></div>
				</header>

				<!-- Overview -->
				<div class="flex flex-col grow items-center w-full px-4 py-6 overflow-y-auto">
					<div class="w-full max-w-4xl bg-neutral-800 rounded-lg p-5 shadow-lg mb-6">
						<div class="flex flex-col sm:flex-row justify-between gap-4">
							<div class="flex items-center gap-3">
								<img src="${getProfilePictureUrlByUserId(tDto.createdBy?.id ?? "unknown")}"
									alt="${tDto.createdBy?.username}"
									class="w-12 h-12 rounded-full object-cover ring-1 ring-white/10">
								<div>
									<div class="font-semibold text-lg">${he.escape(tDto.name ?? "")}</div>
									<div class="text-sm text-stone-300" data-i18n="${k("generic.by_user")}" data-i18n-vars='${JSON.stringify({ user: tDto.createdBy?.username })}'>by ${tDto.createdBy?.username}</div>
								</div>
							</div>
							<div class="flex flex-col sm:items-end justify-center text-sm text-white">
								<div><i class="fa fa-clock-o mr-1"></i> ${startDate}</div>
								<div id="${this.id}-status-badge" class="mt-1 text-xs px-2 py-1 w-fit rounded-full ${statusColor} font-semibold uppercase">
									${tDto.status?.replace("_", " ")}
								</div>
							</div>
						</div>

						<div class="flex flex-wrap gap-6 mt-4 text-sm text-stone-300">
							<div><i class="fa fa-users mr-1"></i>${tDto.participantsCount}/${tDto.maxParticipants}</div>
							<div><i class="fa fa-trophy mr-1"></i>${tDto.type ?? "EIGHT"}</div>
						</div>

						<div class="mt-5 flex flex-wrap gap-3">
							<button id="${this.id}-leave-btn"
								class="${!tDto.isRegisteredToTournament ? 'hidden' : ''} px-4 py-2 bg-red-700 hover:bg-red-600 rounded-md font-semibold text-sm">
								<i class="fa fa-sign-out mr-1"></i>${t("generic.leave_tournament")}
							</button>
							<button id="${this.id}-join-btn"
								class="${tDto.isRegisteredToTournament ? 'hidden' : ''} px-4 py-2 bg-green-700 hover:bg-green-600 rounded-md font-semibold text-sm">
								<i class="fa fa-sign-in mr-1"></i>${t("generic.join_tournament")}
							</button>
							${canStart ? /*html*/`
								<button id="${this.id}-start-btn"
									class="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-md font-semibold text-sm">
									<i class="fa fa-play mr-1"></i>${t("generic.start_tournament")}
								</button>
							` : ''}
							${canDelete ? /*html*/`
								<button id="${this.id}-delete-btn"
									class="px-4 py-2 bg-stone-700 hover:bg-stone-600 rounded-md font-semibold text-sm">
									<i class="fa fa-trash mr-1"></i>${t("generic.delete_tournament")}
								</button>
							` : ''}
						</div>
					</div>

					<!-- Participants -->
					<div class="w-full max-w-4xl bg-neutral-800 rounded-lg p-5 shadow-md mb-6">
						<h2 class="text-lg font-semibold mb-3 flex items-center gap-2">
							<i class="fa fa-users"></i>
							<span data-i18n="${k('generic.participants')}">Participants</span>
						</h2>
						<div id="${this.id}-participants-list" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
						</div>
					</div>

					${tDto.winner
				? /*html*/ `
									<div class="w-full max-w-4xl bg-neutral-800 rounded-lg p-5 shadow-md">
										<h2 class="text-lg font-semibold mb-3 flex items-center gap-2 text-amber-400">
											<i class="fa fa-trophy"></i>
											<span data-i18n="${k('generic.winner')}">Winner</span>
										</h2>
										<div class="flex items-center gap-3">
											<img src="${getProfilePictureUrlByUserId(tDto.winner.id)}"
												class="w-10 h-10 rounded-full ring-2 ring-amber-400">
											<span class="text-lg font-bold text-amber-400">${tDto.winner.username}</span>
										</div>
									</div>
								`
				: ``
			}

					<!-- Bracket -->
					<div class="w-full max-w-4xl bg-neutral-800 rounded-lg p-5 shadow-md mb-6 overflow-x-auto md:overflow-x-visible">
						<h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
							<i class="fa fa-sitemap"></i>
							<span data-i18n="${k("tournament.bracket")}">Bracket</span>
						</h2>

						<div id="${this.id}-bracket-container" class="flex flex-col md:flex-row items-stretch md:items-center justify-center gap-6 md:gap-8 w-full">

							<!-- Round 1 -->
							<div id="${this.id}-bracket-round-1" class="flex flex-col items-center justify-center gap-8 md:gap-16 flex-1 w-full">
								<h3 class="text-center text-sm font-bold text-stone-400 uppercase"
									data-i18n="${k("tournament.quarterfinals")}">Quarterfinals</h3>
								${this.#renderBracketRoundGames(tDto.games ?? [], "QUARTI")}
							</div>

							<!-- Round 2 -->
							<div id="${this.id}-bracket-round-2" class="flex flex-col items-center justify-center gap-8 md:gap-16 flex-1 w-full">
								<h3 class="text-center text-sm font-bold text-stone-400 uppercase"
									data-i18n="${k("tournament.semifinals")}">Semifinals</h3>
								${this.#renderBracketRoundGames(tDto.games ?? [], "SEMIFINALE")}
							</div>

							<!-- Round 3 -->
							<div id="${this.id}-bracket-round-3" class="flex flex-col items-center justify-center gap-8 md:gap-16 flex-1 w-full">
								<h3 class="text-center text-sm font-bold text-stone-400 uppercase"
									data-i18n="${k("tournament.final")}">Final</h3>
								${this.#renderBracketRoundGames(tDto.games ?? [], "FINALE")}
							</div>

						</div>
					</div>

				</div>
				${await this.#loadingOverlays.root.silentRender()}
			</div>
		`;
	}

	async #renderTournamentDTODetails(dto: TournamentDTO) {
		this.#tournamentDto = dto;
		this.#updateBracket(dto.games);
		this.#renderParticipantsList(dto.participants ?? []);
		this.updateTitleSuffix();
	}

	protected async postRender() {
		if (!this.#tournamentDto) return;

		this.#tournamentNamespace = io("/tournament");


		this.#tournamentNamespace.on('connect', () => {
			const socket = this.#tournamentNamespace!;

			socket.emit('join-tournament-lobby', this.#tournamentId);

			// TODO: tournament events
			socket.on('tournament-deleted', (data: { tournamentName: string }) => {
				if (this.#isDeletingTournament) return;
				toast.warn(t('generic.tournament'), t('tournament.tournament_has_been_deleted', data) ?? `The tournament "${data.tournamentName}" has been deleted by the creator.`);
				router.navigate('/play/online/tournaments');
			});

			socket.on('bracket-updated', (tournament: TournamentDTO) => {
				console.debug('Bracket updated: ', tournament);
				this.#renderTournamentDTODetails(tournament);
			});
		})


		this.#renderParticipantsList(this.#tournamentDto.participants ?? []);

		const joinBtn = document.querySelector(`#${this.id}-join-btn`) as HTMLButtonElement | null;
		const leaveBtn = document.querySelector(`#${this.id}-leave-btn`) as HTMLButtonElement | null;
		const startBtn = document.querySelector(`#${this.id}-start-btn`) as HTMLButtonElement | null;
		const deleteBtn = document.querySelector(`#${this.id}-delete-btn`) as HTMLButtonElement | null;

		joinBtn?.addEventListener("click", this.onJoinTournamentClick);
		leaveBtn?.addEventListener("click", this.onLeaveTournamentClick);
		startBtn?.addEventListener("click", this.onStartTournamentClick);
		deleteBtn?.addEventListener("click", this.onDeleteTournamentClick);

		updateDOMTranslations(document.body);
	}


	protected async destroy() {
		document.querySelector(`#${this.id}-start-btn`)?.removeEventListener('click', this.onStartTournamentClick);
		document.querySelector(`#${this.id}-delete-btn`)?.removeEventListener('click', this.onDeleteTournamentClick);
		document.querySelector(`#${this.id}-join-btn`)?.removeEventListener('click', this.onJoinTournamentClick);
		document.querySelector(`#${this.id}-leave-btn`)?.removeEventListener('click', this.onLeaveTournamentClick);

		if (this.#tournamentNamespace) {
			const socketEventsToRemove = [
				'tournament-lobby-joined',
				'tournament-deleted'
			]
			for (const event of socketEventsToRemove) {
				this.#tournamentNamespace.off(event);
			}
			this.#tournamentNamespace.close();
		}

		super.destroy();

	}

	private onJoinTournamentClick = this.#onJoinOrLeaveTournamentClick.bind(this, 'join');
	private onLeaveTournamentClick = this.#onJoinOrLeaveTournamentClick.bind(this, 'leave');
	#onJoinOrLeaveTournamentClick(type: 'leave' | 'join') {
		const joinBtn = document.querySelector(`#${this.id}-join-btn`) as HTMLButtonElement | null;
		const leaveBtn = document.querySelector(`#${this.id}-leave-btn`) as HTMLButtonElement | null;

		const cb = async () => {
			this.#loadingOverlays.root.show();
			try {
				if (type === 'join') {
					const response = await api.tournament.joinTournament.mutate({ tournamentId: this.#tournamentId });
					toast.success(t("generic.join_tournament"), t("generic.join_tournament_success") ?? "");
					this.#renderParticipantsList(response);
					joinBtn?.classList?.add("hidden");
					leaveBtn?.classList?.remove("hidden");
				} else {
					const result = await api.tournament.leaveTournament.mutate({ tournamentId: this.#tournamentId });
					toast.info(t("generic.leave_tournament"), t("generic.leave_tournament_success") ?? "");
					joinBtn?.classList?.remove("hidden");
					leaveBtn?.classList?.add("hidden");
					if (result.tournamentDeleted) {
						router.navigate('/play/online/tournaments');
					}
					const newList = this.#tournamentDto?.participants?.filter(p => p.id !== authManager.user?.id) ?? [];
					this.#renderParticipantsList(newList);
				}
			} catch (err) {
				if (err instanceof TRPCClientError) {
					const msg = err.data?.zodError?.fieldErrors ? Object.values(err.data.zodError.fieldErrors).join(', ') : err.message;
					toast.error(t("generic.join_tournament"), msg);
					console.warn(err);
				} else {
					toast.error(t("generic.join_tournament"), t("error.generic_server_error") ?? "");
					console.error(err);
				}
			}
			this.#loadingOverlays.root.hide();
		}
		cb();
	}

	private onStartTournamentClick = this.#onStartTournamentClick.bind(this);
	#onStartTournamentClick() {
		const startButton = document.querySelector(`#${this.id}-start-btn`);
		const cb = async () => {
			this.#loadingOverlays.root.show();
			try {
				const oldClassName = this.#getTournamentStatusBadgeColorClass(this.#tournamentDto?.status ?? "WAITING_PLAYERS").split(' ');
				const tournamentDTO = await api.tournament.startTournament.mutate({ tournamentId: this.#tournamentId });
				toast.success(t("generic.start_tournament"), t("generic.start_tournament_success") ?? "");
				await this.#renderTournamentDTODetails(tournamentDTO);
				const newClassName = this.#getTournamentStatusBadgeColorClass(this.#tournamentDto?.status ?? "WAITING_PLAYERS").split(' ');

				startButton?.remove();

				const statusBadge = document.getElementById(`${this.id}-status-badge`);
				if (statusBadge) {
					statusBadge.classList.remove(...oldClassName);
					statusBadge.classList.add(...newClassName);
					statusBadge.textContent = this.#tournamentDto?.status?.replace("_", " ") ?? "";
				}

			} catch (err) {
				if (err instanceof TRPCClientError) {
					const msg = err.data?.zodError?.fieldErrors ? Object.values(err.data.zodError.fieldErrors).join(', ') : err.message;
					toast.error(t("generic.start_tournament"), msg);
					console.warn(err);
				} else {
					toast.error(t("generic.start_tournament"), t("error.generic_server_error") ?? "");
					console.error(err);
				}
			}
			this.#loadingOverlays.root.hide();
		}
		cb();
	}


	private onDeleteTournamentClick = this.#onDeleteTournamentClick.bind(this);
	#onDeleteTournamentClick() {
		ConfirmModal.create({
			title: /*html*/`
				<div class="flex items-center gap-2">
					<i class="fa fa-trash text-red-500"></i>
					<span class="text-lg font-bold">${t("generic.delete_tournament")}</span>
				</div>
			`,
			message: t("generic.delete_tournament_confirm") ?? "Are you sure you want to delete this tournament? This action cannot be undone.",
			onConfirm: async () => {

				this.#loadingOverlays.root.show();
				try {
					this.#isDeletingTournament = true;
					await api.tournament.deleteTournament.mutate({ tournamentId: this.#tournamentId });
					toast.success(t("generic.delete_tournament"), t("generic.delete_tournament_success") ?? "");
					router.navigate('/play/online/tournaments');
				} catch (err) {
					if (err instanceof TRPCClientError) {
						const msg = err.data?.zodError?.fieldErrors ? Object.values(err.data.zodError.fieldErrors).join(', ') : err.message;
						toast.error(t("generic.delete_tournament"), msg);
						console.warn(err);
					} else {
						toast.error(t("generic.delete_tournament"), t("error.generic_server_error") ?? "");
						console.error(err);
					}
				} finally {
					this.#isDeletingTournament = false;
				}
				this.#loadingOverlays.root.hide();
			},
			onCancel: () => { },
			confirmButtonText: t("generic.confirm") ?? "Delete",
			cancelButtonText: t("generic.cancel") ?? "Cancel",
			invertConfirmAndCancelColors: true,
		})
	}


	#updateBracket(games: RouterOutputs["tournament"]["getTournamentDetails"]["games"]) {
		const bracketContainer = document.querySelector(`#${this.id}-bracket-container`);
		if (!bracketContainer) return;

		games?.forEach((game, index) => {
			let gameEl = bracketContainer.querySelector(`[data-game-id="${game.id}"]`) as HTMLElement | null;
			if (gameEl) {
				this.#updateBracketGame(gameEl, game);
			}
		})

		games?.forEach((game, index) => {
			let gameEl = bracketContainer.querySelector(`[data-game-id="${game.id}"]`) as HTMLElement | null;
			const nextGameEl = bracketContainer.querySelector(`[data-game-id="${game.nextGameId}"]`) as HTMLElement | null;
			// if (gameEl && nextGameEl) {}
		});

	}

	#getUserUsername(game: TournamentGame, givenId: string, givenUsername: string, isAI = false) {
		return isAI || (givenId === "placeholder-tournament-user")
			? (!isAI && !game.startDate)
				? /*html*/`<p class="text-stone-400 font-thin" data-i18n="${k('generic.tbd')}">TBD</p>`
				: /*html*/`<p data-i18n="${k('generic.ai')}">AI</p>`
			: givenUsername;
	}

	#updateBracketGame(gameEl: HTMLElement, game: TournamentGame) {
		gameEl.querySelector('.left-player-username')!.innerHTML = this.#getUserUsername(game, game.leftPlayer.id, game.leftPlayerUsername ?? game.leftPlayer?.username, game.leftPlayerIsAI);
		gameEl.querySelector('.right-player-username')!.innerHTML = this.#getUserUsername(game, game.rightPlayer.id, game.rightPlayerUsername ?? game.rightPlayer?.username, game.rightPlayerIsAI);

		gameEl.querySelector('.left-player-score')!.innerHTML = game.leftPlayerScore.toString();
		gameEl.querySelector('.right-player-score')!.innerHTML = game.rightPlayerScore.toString();

		const gameState = gameEl.querySelector('.state')
		if (gameState) {
			const key = this.#getGameStateKey(game);
			const value = this.#getGameStateFallbackValue(game);
			gameState.setAttribute('data-i18n', key);
			gameState.innerHTML = value;
		}
		updateDOMTranslations(gameEl);
	}

	#renderBracketRoundGames(games: NonNullable<RouterOutputs["tournament"]["getTournamentDetails"]["games"]>, round: TournamentRoundType) {
		let filteredGames: typeof games = [];
		filteredGames = games.filter(g => g.tournamentRound === round);

		if (!filteredGames.length) {
			return /*html*/`<div class="text-center text-stone-500 text-xs italic">No games</div>`;
		}

		return filteredGames
			.map((g, index) => /*html*/ `
				<div data-game-id="${g.id}"  class="bg-neutral-700/40 rounded-md p-2 md:px-5 py-4 flex flex-col items-center justify-center w-full md:min-w-44 relative">
					<p class="absolute bottom-2 left-2 text-sm uppercase text-stone-400 font-semibold font-mono">${index + 1}</p>
					<div class=" items-center text-sm text-center gap-1 grid grid-flow-row grid-cols-3">
						<div class="flex flex-col justify-center items-center gap-1">
							<div class="font-semibold left-player-username md:px-2">${this.#getUserUsername(g, g.leftPlayer.id, g.leftPlayerUsername ?? g.leftPlayer?.username, g.leftPlayerIsAI)}</div>
							<p class="left-player-score">${g.leftPlayerScore}</p>
						</div>
						<span class="text-stone-400 text-xs" data-i18n="${k('generic.vs')}">vs</span>
						<div class="flex flex-col justify-center items-center gap-1">
							<div class="font-semibold right-player-username md:px-2">${this.#getUserUsername(g, g.rightPlayer.id, g.rightPlayerUsername ?? g.rightPlayer?.username, g.rightPlayerIsAI)}</div>
							<p class="right-player-score">${g.rightPlayerScore}</p>
						</div>
					</div>
					<div class="text-xs text-stone-400 mt-2">
						<p class="uppercase font-bold state" data-i18n="${this.#getGameStateKey(g)}">
							${this.#getGameStateFallbackValue(g)}
						</p>
					</div>
				</div>
				`
			)
			.join("");
	}

	#getGameStateKey(game: TournamentGame) {
		return game.endDate ? k('generic.finished') : game.abortDate ? k('generic.aborted') : game?.startDate ? k('generic.in_progress') : k('generic.pending');
	}

	#getGameStateFallbackValue(game: TournamentGame) {
		return game.endDate ? 'Finished' : game.abortDate ? 'Aborted' : game?.startDate ? "In Progress" : "Pending";
	}

	#renderParticipantsList(participants: NonNullable<RouterOutputs["tournament"]["getTournamentDetails"]["participants"]>) {
		const container = document.querySelector(`#${this.id}-participants-list`);
		if (!container) {
			console.debug('Participants list not found. Page may be navigating away.');
			return;
		}

		container.innerHTML = '';

		for (const p of participants) {
			const item = document.createElement('div');

			item.className = `flex items-center gap-2 bg-neutral-700/50 p-2 rounded-md`;
			item.id = `tournament-participant-${p.id}`;
			item.innerHTML = /*html*/`
				<img src="${getProfilePictureUrlByUserId(p.id)}"
					alt="${p.username}"
					class="w-8 h-8 rounded-full ring-1 ring-white/10 object-cover">
				<span class="truncate">${p.username}</span>
			`;

			container?.appendChild(item);
			updateDOMTranslations(item);
		}
	}

}
