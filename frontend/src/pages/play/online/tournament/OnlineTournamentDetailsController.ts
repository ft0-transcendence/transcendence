import { api } from "@main";
import { RouteController } from "@src/tools/ViewController";

export class OnlineTournamentDetailsController extends RouteController {

	#tournamentId: string = "";

	constructor(params: Record<string, string> | undefined = undefined) {
		super(params);

		this.#tournamentId = this.params.tournamentId;
	}

	protected async render() {
		return /*html*/`
			<div class="flex flex-col">
				<h1 class="text-2xl">TOURNAMENT DETAILS</h1>

				<div>
					TOURNAMENT ID: ${this.#tournamentId}
				</div>
				<div>
				</div>
			</div>
		`;
	}

	protected async postRender() {

	}
}
