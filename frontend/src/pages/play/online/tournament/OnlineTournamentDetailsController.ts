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

// TODO: it's a little messy, refactor this
export class OnlineTournamentDetailsController extends RouteController {
	#tournamentId: string = "";
	#tournamentDto: RouterOutputs["tournament"]["getTournamentDetails"] | null = null;

	#tournamentNamespace: Socket | null = null;
	#bracketPollingTimeout: NodeJS.Timeout | null = null;
	#bracketPollingMs = 5000;

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
		try {
			this.#tournamentDto = await api.tournament.getTournamentDetails.query({tournamentId: this.#tournamentId});
		} catch (err) {
			if (err instanceof TRPCClientError) {
				const msg = err.data?.zodError?.fieldErrors ? Object.values(err.data.zodError.fieldErrors).join(", ") : err.message;
				toast.error(t("generic.join_tournament"), msg);
			} else {
				toast.error(t("generic.join_tournament"), t("error.generic_server_error") ?? "");
			}
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

	protected async render() {
		if (!this.#tournamentDto) return this.#renderNotFound();

		console.debug('Rendering tournament details page. Tournament: ', this.#tournamentDto);

		const tDto = this.#tournamentDto;
		const startDate = new Date(tDto.startDate).toLocaleString();
		const statusColor = tDto.status === "WAITING_PLAYERS" ? "bg-yellow-600" : tDto.status === "IN_PROGRESS" ? "bg-green-600" : "bg-red-700";

		return /*html*/ `
			<div class="flex flex-col relative grow bg-neutral-900 text-white">
				<header class="sticky top-0 right-0 z-10 bg-black/50 flex items-center py-3 px-6 w-full">
					<a data-route="/play/online/tournaments" href="/play/online/tournaments"
						class="text-stone-400 hover:text-stone-200 transition-colors flex items-center gap-2">
						<i class="fa fa-arrow-left"></i>
						<span data-i18n="${k("generic.back_to_list")}">Back to list</span>
					</a>
					<div class="grow"></div>
					<div class="font-semibold text-xl">${he.escape(tDto.name)}</div>
				</header>

				<!-- Overview -->
				<div class="flex flex-col grow items-center w-full px-4 py-6 overflow-y-auto">
					<div class="w-full max-w-4xl bg-neutral-800 rounded-lg p-5 shadow-lg mb-6">
						<div class="flex flex-col sm:flex-row justify-between gap-4">
							<div class="flex items-center gap-3">
								<img src="${getProfilePictureUrlByUserId(tDto.createdBy.id)}"
									alt="${tDto.createdBy.username}"
									class="w-12 h-12 rounded-full object-cover ring-1 ring-white/10">
								<div>
									<div class="font-semibold text-lg">${he.escape(tDto.name)}</div>
									<div class="text-sm text-stone-300" data-i18n="${k("generic.by_user")}" data-i18n-vars='${JSON.stringify({user: tDto.createdBy.username})}'>by ${tDto.createdBy.username}</div>
								</div>
							</div>
							<div class="flex flex-col sm:items-end justify-center text-sm text-stone-300">
								<div><i class="fa fa-clock-o mr-1"></i> ${startDate}</div>
								<div class="mt-1 text-xs px-2 py-1 rounded-full ${statusColor} font-semibold uppercase">
									${tDto.status.replace("_", " ")}
								</div>
							</div>
						</div>

						<div class="flex flex-wrap gap-6 mt-4 text-sm text-stone-300">
							<div><i class="fa fa-users mr-1"></i>${tDto.participantsCount}/${tDto.maxParticipants}</div>
							<div><i class="fa fa-trophy mr-1"></i>${tDto.type ?? "EIGHT"}</div>
						</div>

						<div class="mt-5 flex gap-3">
							<button id="${this.id}-leave-btn"
								class="${!tDto.isRegisteredToTournament ? 'hidden' : ''} px-4 py-2 bg-red-700 hover:bg-red-600 rounded-md font-semibold text-sm">
								<i class="fa fa-sign-out mr-1"></i>${t("generic.leave_tournament")}
							</button>
							<button id="${this.id}-join-btn"
								class="${tDto.isRegisteredToTournament ? 'hidden' : ''} px-4 py-2 bg-green-700 hover:bg-green-600 rounded-md font-semibold text-sm">
								<i class="fa fa-sign-in mr-1"></i>${t("generic.join_tournament")}
							</button>
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

					<!-- Games -->
					<!-- <div class="w-full max-w-4xl bg-neutral-800 rounded-lg p-5 shadow-md mb-6">
						<h2 class="text-lg font-semibold mb-3 flex items-center gap-2">
							<i class="fa fa-gamepad"></i>
							<span data-i18n="${k('generic.games')}">Games</span>
						</h2>
						${tDto.games.length > 0
							? /*html*/`
								<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
									${tDto.games.map((g) => /*html*/ `
										<div data-gameId="${g.id}" class="bg-neutral-700/50 p-3 rounded-md flex flex-col gap-2 text-sm">
											<div class="flex justify-between">
												<span class="font-semibold">${g.leftPlayer.username}</span>
												<span class="text-stone-400" data-i18n="${k('generic.vs')}">vs</span>
												<span class="font-semibold">${g.rightPlayer.username}</span>
											</div>
											<div class="flex justify-between text-xs text-stone-400">
												<span><span data-i18n="${k('generic.score_goal')}">Score goal</span>: ${g.scoreGoal}</span>
												<span>${new Date(g.startDate).toLocaleString()}</span>
											</div>
										</div>`
									)
									.join("")}
								</div>
							`
							: /*html*/`
								<div class="text-stone-400 text-sm italic" data-i18n="${k('generic.no_games_yet')}">No games yet</div>
							`
						}
					</div> -->

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
						: ""
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
								${this.#renderBracketRoundGames(tDto.games, "QUARTI")}
							</div>

							<!-- Round 2 -->
							<div id="${this.id}-bracket-round-2" class="flex flex-col items-center justify-center gap-8 md:gap-16 flex-1 w-full">
								<h3 class="text-center text-sm font-bold text-stone-400 uppercase"
									data-i18n="${k("tournament.semifinals")}">Semifinals</h3>
								${this.#renderBracketRoundGames(tDto.games, "SEMIFINALE")}
							</div>

							<!-- Round 3 -->
							<div id="${this.id}-bracket-round-3" class="flex flex-col items-center justify-center gap-8 md:gap-16 flex-1 w-full">
								<h3 class="text-center text-sm font-bold text-stone-400 uppercase"
									data-i18n="${k("tournament.final")}">Final</h3>
								${this.#renderBracketRoundGames(tDto.games, "FINALE")}
							</div>

						</div>
					</div>

				</div>
				${await this.#loadingOverlays.root.silentRender()}
			</div>
		`;
	}


	// TODO: ideally it should be a websocket event, but for now it's a polling
	async #pollTournamentDetails() {
		if (!this.#tournamentDto) return;
		try {
			const tournament = await api.tournament.getTournamentDetails.query({ tournamentId: this.#tournamentId });
			this.#tournamentDto = tournament;
			tournament.games.forEach(g => this.#updateBracket(tournament.games));
			this.#renderParticipantsList(tournament.participants);
		} catch (err) {
			console.error('Error polling tournament details:', err);
		}
		if (this.#bracketPollingTimeout){
			clearTimeout(this.#bracketPollingTimeout);
		};
		this.#bracketPollingTimeout = setTimeout(() => this.#pollTournamentDetails(), this.#bracketPollingMs);
	}

	protected async postRender() {
		if (!this.#tournamentDto) return;

		this.#tournamentNamespace = io("/tournament");
		this.#tournamentNamespace.emit('join-tournament-lobby', this.#tournamentId);

		// TODO: tournament events

		this.#pollTournamentDetails();

		this.#renderParticipantsList(this.#tournamentDto.participants);

		const joinBtn = document.querySelector(`#${this.id}-join-btn`) as HTMLButtonElement | null;
		const leaveBtn = document.querySelector(`#${this.id}-leave-btn`) as HTMLButtonElement | null;
		const id = this.#tournamentId;

		if (joinBtn) {
			joinBtn.addEventListener("click", async () => {
				this.#loadingOverlays.root.show();
				try {
					const response = await api.tournament.joinTournament.mutate({ tournamentId: id });
					toast.success(t("generic.join_tournament"), t("generic.join_tournament_success") ?? "");
					this.#renderParticipantsList(response);
					joinBtn?.classList?.add("hidden");
					leaveBtn?.classList?.remove("hidden");
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
			});
		}
		if (leaveBtn) {
			leaveBtn.addEventListener("click", async () => {
				this.#loadingOverlays.root.show();
				try {
					const result = await api.tournament.leaveTournament.mutate({ tournamentId: id });
					toast.info(t("generic.leave_tournament"), t("generic.leave_tournament_success") ?? "");
					joinBtn?.classList?.remove("hidden");
					leaveBtn?.classList?.add("hidden");
					if (result.tournamentDeleted){
						router.navigate('/play/online/tournaments');
					}
					const newList = this.#tournamentDto?.participants.filter(p => p.id !== authManager.user?.id) ?? [];
					this.#renderParticipantsList(newList);
				} catch (err) {
					if (err instanceof TRPCClientError) {
						const msg = err.data?.zodError?.fieldErrors ? Object.values(err.data.zodError.fieldErrors).join(', ') : err.message;
						toast.error(t("generic.leave_tournament"), msg);
						console.warn(err);
					} else {
						toast.error(t("generic.leave_tournament"), t("error.generic_server_error") ?? "");
						console.error(err);
					}
				}
				this.#loadingOverlays.root.hide();
			});
		}

		updateDOMTranslations(document.body);
	}


	protected async destroy() {
		if (this.#tournamentNamespace) {
			this.#tournamentNamespace.off('tournament-lobby-joined');
			this.#tournamentNamespace.close();
		}
		if (this.#bracketPollingTimeout) {
			clearTimeout(this.#bracketPollingTimeout);
		}
		super.destroy();

	}

	#updateBracket(games: RouterOutputs["tournament"]["getTournamentDetails"]["games"]) {
		const bracketContainer = document.querySelector(`#${this.id}-bracket-container`);
		if (!bracketContainer) return;

		games.forEach((game, index)=>{
			let gameEl = bracketContainer.querySelector(`[data-game-id="${game.id}"]`) as HTMLElement | null;
			if (gameEl) {
				this.#updateBracketGame(gameEl, game);
			}
		})

	}

	#getUserUsername(user: RouterOutputs["tournament"]["getTournamentDetails"]["games"][number]['leftPlayer'] | RouterOutputs["tournament"]["getTournamentDetails"]["games"][number]['rightPlayer']) {
		return (user.id === 'placeholder-tournament-user')
			? /*html*/`<p class="text-stone-400 font-thin" data-i18n="${k('generic.tbd')}">TBD</p>`
			: user.username;
	}

	#updateBracketGame(gameEl: HTMLElement, game: RouterOutputs["tournament"]["getTournamentDetails"]["games"][number]) {
		gameEl.querySelector('.left-player-username')!.innerHTML = this.#getUserUsername(game.leftPlayer);
		gameEl.querySelector('.right-player-username')!.innerHTML = this.#getUserUsername(game.rightPlayer);

		gameEl.querySelector('.left-player-score')!.innerHTML = game.leftPlayerScore.toString();
		gameEl.querySelector('.right-player-score')!.innerHTML = game.rightPlayerScore.toString();

		const gameState = gameEl.querySelector('.state')
		if (gameState) {
			const key = game.endDate ? k('generic.finished') : game.abortDate ? k('generic.aborted') : k('generic.pending');
			const value = game.endDate ? 'Finished' : game.abortDate ? 'Aborted' : 'Pending';
			gameState.setAttribute('data-i18n', key);
			gameState.innerHTML = value;
		}
		updateDOMTranslations(gameEl);
	}

	#renderBracketRoundGames(games: RouterOutputs["tournament"]["getTournamentDetails"]["games"], round: TournamentRoundType) {
		let filteredGames: typeof games = [];
		filteredGames = games.filter(g => g.tournamentRound === round);

		if (!filteredGames.length) {
			return /*html*/`<div class="text-center text-stone-500 text-xs italic">No games</div>`;
		}

		return filteredGames
			.map((g, index) => /*html*/ `
				<div id="${g.id}" class="bg-neutral-700/40 rounded-md p-3 flex flex-col items-center justify-center w-full md:w-44 relative">
					<p class="absolute bottom-2 left-2 text-sm uppercase text-stone-400 font-semibold font-mono">${index + 1}</p>
					<div class="flex flex-col items-center text-sm text-center gap-1">
						<span class="font-semibold">${this.#getUserUsername(g.leftPlayer)}</span>
						<span class="text-stone-400 text-xs">vs</span>
						<span class="font-semibold">${this.#getUserUsername(g.rightPlayer)}</span>
					</div>
					<div class="text-xs text-orange-600 mt-2">
						<div class="flex gap-1 items-center">
							<span>${g.leftPlayerScore}</span>
							<span>:</span>
							<span>${g.rightPlayerScore}</span>
						</div>
					</div>
					<div class="text-xs text-stone-400 mt-2">
						<p class="uppercase font-bold" data-i18n="${g.endDate != null ? k('generic.finished') : g.abortDate ? k('generic.aborted') : k('generic.pending')}">
							${g.endDate != null ? 'Finished' : g.abortDate ? 'Aborted' : 'Pending'}
						</p>
					</div>
				</div>
				`
			)
			.join("");
	}

	#renderParticipantsList(participants: RouterOutputs["tournament"]["getTournamentDetails"]["participants"]) {
		const container = document.querySelector(`#${this.id}-participants-list`);
		if (!container) {
			console.warn('Participants list not found. Cannot render participants');
			return;
		}

		container.innerHTML = '';

		for (const p of participants) {
			const item = document.createElement('div');

			item.className = `flex items-center gap-2 bg-neutral-700/50 p-2 rounded-md`;
			item.id=`tournament-participant-${p.id}`;
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
