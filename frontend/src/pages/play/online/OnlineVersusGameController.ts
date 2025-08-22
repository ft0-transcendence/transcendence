import { RouteController } from "@src/tools/ViewController";

export class OnlineVersusGameController extends RouteController {
	#gameId: string = "";

	protected async preRender(): Promise<void> {
		this.#gameId = this.params.gameId;

		console.debug('OnlineVersusGameController preRender. Params:', this.params);

	}

	async render(){
		return /*html*/`<div>
			<h1>Online Versus Game</h1>
			<h2>Game ID: ${this.#gameId}</h2>
		</div>`;
	}
}
