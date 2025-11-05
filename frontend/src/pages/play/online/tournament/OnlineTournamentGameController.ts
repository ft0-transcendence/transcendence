import { api } from "@main";
import { RouteController } from "@src/tools/ViewController";

export class OnlineTournamentGameController extends RouteController {

	#gameId: string = "";
	#tournamentId: string = "";

	constructor(params: Record<string, string> | undefined = undefined) {
		super(params);

		this.#gameId = this.params.gameId;
		this.#tournamentId = this.params.tournamentId;
	}

	protected async render() {
		return /*html*/`
			<div class="flex flex-col">
				<h1 class="text-2xl">TOURNAMENT GAME</h1>
				<div>
					TOURNAMENT ID: ${this.#tournamentId}
				</div>
				<div>
					GAME ID: ${this.#gameId}
				</div>
			</div>
		`;
	}

	protected async postRender() {

	}
}
