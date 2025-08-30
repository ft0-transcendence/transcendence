import { Game, GameType, GameUserInfo } from "@shared";
import { k } from "@src/tools/i18n";
import toast from "@src/tools/Toast";
import { ComponentController } from "@src/tools/ViewController";

export type GameComponentProps = {

	gameId: string;
	gameType: GameType;

	isLocalGame: boolean;
}

export class GameComponent extends ComponentController {
	#props: GameComponentProps = {
		gameId: '',
		gameType: 'VS',
		isLocalGame: true,
	};

	#gameState: Game['state'] | null = null;

	#gameCanvas: HTMLCanvasElement | null = null;
	#ctx: CanvasRenderingContext2D | null = null;

	constructor(props: Partial<GameComponentProps> = {}) {
		super();
		this.updateProps(props);
	}

	async render() {
		return /*html*/`
			<div id="${this.id}-game" class="relative w-full h-full aspect-square flex flex-col bg-black/50">
				<div class="absolute top-0 left-0">
					<span class="font-bold text-xl">DBG GAME STATE</span>
					<p id="${this.id}-game-state">${this.#gameState}</p>
				</div>
				<div class="flex flex-col grow bg-black/50 w-full items-center justify-center">
					<canvas id="${this.id}-game-canvas" class="w-full aspect-[4/3]"></canvas>
				</div>
				<div id="${this.id}-error-container" class="absolute top-0 left-0 z-20 w-full h-full bg-black/50 flex flex-col justify-center items-center !hidden">
					<h4 id="${this.id}-error-message" class="text-red-500"></h4>

					<a href="/play" data-route="/play" class="route-link nav-route" data-i18n="${k('generic.go_back')}">
						Go back
					</a>
				</div>
			</div>
		`;
	}

	protected async postRender() {
		this.#gameCanvas = document.getElementById(`${this.id}-game-canvas`)! as HTMLCanvasElement;
		this.#ctx = this.#gameCanvas.getContext('2d')!;

		this.#initCanvasData();

		this.#updateGameStateElements();
	}

	#initCanvasData() {
		const canvas = this.#gameCanvas!;
		const ctx = this.#ctx!;
		canvas.width = canvas.clientWidth;
		canvas.height = canvas.clientHeight;
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}



	protected async destroy() {

	}

	public updateGameState(state: Game['state']) {
		console.debug('Game state update', state);
		this.#gameState = state;
		this.#updateGameStateElements();
	}


	#updateGameStateElements() {
		document.getElementById(`${this.id}-game-state`)!.textContent = JSON.stringify(this.#gameState, null, 2);
	}

	public updateProps(props: Partial<GameComponentProps>) {
		this.#props = {
			...this.#props,
			...props,
		};
	}

	public showError(error: string) {
		toast.error('Error', error);
		const errorContainer = document.getElementById(`${this.id}-error-container`)!;
		const errorMessage = document.getElementById(`${this.id}-error-message`)!;
		errorContainer.classList.remove('!hidden');
		errorMessage.innerHTML = error;
	}
	public hideError() {
		const errorContainer = document.getElementById(`${this.id}-error-container`)!;
		errorContainer.classList.add('!hidden');
	}

}
