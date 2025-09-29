import { k } from "@src/tools/i18n";
import { ComponentController } from "@src/tools/ViewController";

export class LoadingOverlay extends ComponentController {

	#divId: string;

	constructor(customId?: string) {
		super();

		this.#divId = `${this.id}-${customId ?? 'loading'}`;
	}

	async render() {
		return /*html*/`
			<div id="${this.#divId}" class="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-lg font-semibold hidden">
				<i class="fa fa-spinner fa-spin mr-2"></i> <span data-i18n="${k('generic.loading')}">Loading...</span>
			</div>
		`;
	}

	public show() {
		document.getElementById(this.#divId)?.classList.remove('hidden');
	}
	public hide() {
		document.getElementById(this.#divId)?.classList.add('hidden');
	}
}
