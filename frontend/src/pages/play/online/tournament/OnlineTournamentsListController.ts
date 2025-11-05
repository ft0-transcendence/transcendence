import { api } from "@main";
import { RouterOutputs } from "@shared";
import { LoadingOverlay } from "@src/components/LoadingOverlay";
import { k } from "@src/tools/i18n";
import { RouteController } from "@src/tools/ViewController";
import { t } from '../../../../../../backend/src/trpc/trpc';

export class TournamentsListController extends RouteController {

	#loadingOverlays = {
		tournamentList: new LoadingOverlay()
	};

	protected async preRender() {
		this.registerChildComponent(this.#loadingOverlays.tournamentList);
	}

	protected async render() {
		return /*html*/`
			<div class="flex flex-col relative grow">
				<h1 class="text-2xl" data-i18n="${k('generic.tournaments')}">Tournaments</h1>

				<div class="relative grow flex flex-col items-center w-full">
					<ul id="${this.id}-tournaments-list" class="w-full max-w-4xl flex flex-col gap-2 items-center grow overflow-y-auto">
					</ul>
				</div>
					${await this.#loadingOverlays.tournamentList.silentRender()}

				<div>
				</div>

			</div>
		`;
	}

	protected async postRender() {

		this.#loadingOverlays.tournamentList.show();
		this.#fetchAndShowTournaments();

	}

	async #fetchAndShowTournaments() {

		const tournaments = await api.tournament.getAvailableTournaments.query();
		console.debug('Tournaments', tournaments);

		const tournamentsList = document.querySelector(`#${this.id}-tournaments-list`);

		for (const tournament of tournaments) {
			console.debug('Tournament', tournament);
			const tournamentElement = this.#createTournamentItem(tournament);
			tournamentsList?.appendChild(tournamentElement);
		}

		const randomDateStart = (minDate: Date, maxDate: Date) => {
			return new Date(minDate.getTime() + Math.random() * (maxDate.getTime() - minDate.getTime()));
		}


		const mockTournaments: typeof tournaments = [
			{
				id: '1',
				name: 'Tournament 1',
				maxParticipants: 10,
				participantsCount: 5,
				createdBy: {
					username: 'sasha',
					id: 'sasha_id',
				},
				hasPassword: false,
				startDate: randomDateStart(new Date(2025, 11, 6), new Date(2025, 11, 10)),
				status: "WAITING_PLAYERS",
				type: "EIGHT"
			},
			{
				id: '2',
				name: 'Mock Tournament 2',
				maxParticipants: 10,
				participantsCount: 5,
				createdBy: {
					username: 'sasha',
					id: 'sasha_id',
				},
				hasPassword: false,
				startDate: randomDateStart(new Date(2025, 11, 6), new Date(2025, 11, 10)),
				status: "WAITING_PLAYERS",
				type: "EIGHT"
			},
		]
		for (const tournament of mockTournaments) {
			console.debug('Mock Tournament', tournament);
			const tournamentElement = this.#createTournamentItem(tournament);
			tournamentsList?.appendChild(tournamentElement);
		}

		this.#loadingOverlays.tournamentList.hide();
	}


	#createTournamentItem(tournament: RouterOutputs['tournament']['getAvailableTournaments'][number]) {
		const tournamentElement = document.createElement('div');

		tournamentElement.className = "flex flex-col gap-2 items-center justify-center px-8 py-5 bg-stone-700 w-full";
		tournamentElement.innerHTML = /*html*/`
			<div class="flex items-center justify-center gap-1">
				<div class="tournament-item-name font-mono text-xs sm:text-xl font-bold">${tournament?.name }</div>
				<div class="flex items-center justify-center gap-1">
					<div class="tournament-item-players font-mono text-xs sm:text-xl font-bold">${tournament?.maxParticipants || 0}</div>
					<i class="fa fa-users text-2xl"></i>
				</div>
			</div>
			<div class="flex gap-2 items-center justify-center">
				<div class="tournament-joined-players-count font-mono text-xs sm:text-xl font-bold">${tournament?.participantsCount || 0}</div>
				/
				<div class="tournament-total-players-count font-mono text-xs sm:text-xl font-bold">${tournament?.maxParticipants || 0}</div>
			</div>
		`;

		return tournamentElement;
	}
}
