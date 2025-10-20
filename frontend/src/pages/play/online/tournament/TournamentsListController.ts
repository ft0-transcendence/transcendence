import { api } from "@main";
import { RouteController } from "@src/tools/ViewController";

export class TournamentsListController extends RouteController {


	protected async render() {
		return /*html*/`
			<div class="flex flex-col">
				<h1 class="text-2xl">Tournaments</h1>
				<div>
				</div>
				<div>
				</div>
			</div>
		`;
	}

	protected async postRender() {

	}

	async #fetchAndShowTournaments() {

		const tournaments = await api.tournament.getAvailableTournaments.query();
		console.debug('Tournaments', tournaments);

		const tournamentsList = document.querySelector('#tournaments-list');

		for (const tournament of tournaments) {
			console.debug('Tournament', tournament);
			const tournamentElement = this.#createTournamentItem(tournament);
			document.querySelector('#tournaments-list')?.appendChild(tournamentElement);
		}
	}


	#createTournamentItem(tournament: any) {
		const tournamentElement = document.createElement('div');
		
		tournamentElement.className = "flex flex-col gap-2 items-center justify-center";
		tournamentElement.innerHTML = /*html*/`
			<div class="flex items-center justify-center gap-1">
				<div class="tournament-item-name font-mono text-xs sm:text-xl font-bold">${tournament?.name }</div>
				<div class="flex items-center justify-center gap-1">
					<div class="tournament-item-players font-mono text-xs sm:text-xl font-bold">${tournament?.playerCount || 0}</div>
					<i class="fa fa-users text-2xl"></i>
				</div>
			</div>
			<div class="flex flex-col gap-2 items-center justify-center">
				<div class="tournament-joined-players-count font-mono text-xs sm:text-xl font-bold">${tournament?.joinedPlayerCount || 0}</div>
				/
				<div class="tournament-total-players-count font-mono text-xs sm:text-xl font-bold">${tournament?.totalPlayerCount || 0}</div>
			</div>
		`;

		return tournamentElement;
	}
}
