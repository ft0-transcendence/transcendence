import { AiAccuracy as AIAccuracyEnum } from "../constants";
import { Game, GameStatus } from "./game";

export type AIBrainConfig = {
	accuracy: AIAccuracyEnum;
	position: "left" | "right";
}
export class AIBrain {
	#accuracy: AIAccuracyEnum = AIAccuracyEnum.NORMAL;
	#position: AIBrainConfig['position'] = 'left';


	constructor(config?: Partial<AIBrainConfig>) {

		if (config?.accuracy !== undefined) {
			this.#accuracy = Math.max(config.accuracy, 0.4);
			console.debug(`AIBrain: Using specified accuracy: ${this.#accuracy}`);
		} else {
			const values = Object.values(AIAccuracyEnum);
			this.#accuracy = values[Math.floor(Math.random() * values.length)] as AIAccuracyEnum;
			console.debug(`AIBrain: No accuracy specified, using random value: ${this.#accuracy}`);
		}
		if (config?.position) {
			this.#position = config.position;
		}
	}

	public setPosition(position: AIBrainConfig['position']) {
		this.#position = position;
	}
	public setAccuracy(accuracy: AIAccuracyEnum) {
		this.#accuracy = accuracy
	}

	get accuracy() {
		return this.#accuracy;
	}
	get errorRate() {
		return 1 - this.#accuracy;
	}

	#getDeadZone() {
		return 5;
	}


	public processCycle(state: GameStatus, gameInstance: Game) {
		if (state.state !== 'RUNNING') return;

		// reaction delay (frame skipping). needed?
		if (Math.random() > this.#accuracy) { return; }


		const myPaddlePos = this.#position === 'left' ? state.paddles.left : state.paddles.right;

		let target = 50;

		if (this.#ballComingTowardsMe(state.ball)) {
			target = state.ball.y;
		}

		const diff = target - myPaddlePos;

		gameInstance.release(this.#position, 'up');
		gameInstance.release(this.#position, 'down');

		if (Math.abs(diff) <= this.#getDeadZone()) {
			return;
		}

		const moveDown = diff > 0;

		gameInstance.press(this.#position, moveDown ? 'down' : 'up');
	}


	#ballComingTowardsMe(ball: GameStatus['ball']) {
		return this.#position === 'left'
			? ball.dirX < 0
			: ball.dirX > 0;
	}

}
