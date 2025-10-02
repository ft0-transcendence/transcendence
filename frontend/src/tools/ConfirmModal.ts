import { t, updateDOMTranslations } from "./i18n";

export type ConfirmModalOptions = {
	title: string;
	message: string;

	hideCloseButton?: boolean;
	hideCancelButton?: boolean;
	hideConfirmButton?: boolean;

	confirmButtonText?: string;
	cancelButtonText?: string;
	onConfirm?: () => void;
	onCancel?: () => void;

	invertConfirmAndCancelColors?: boolean;
}

export class ConfirmModal {
	static async create(options: ConfirmModalOptions) {
		const modal = new ConfirmModal(options);
		await modal.show();
		return modal;
	}

	private readonly options: ConfirmModalOptions;

	private readonly modalContainer: HTMLElement;
	private readonly titleElement: HTMLElement;
	private readonly messageElement: HTMLElement;
	private readonly confirmButtonElement: HTMLElement;
	private readonly cancelButtonElement: HTMLElement;

	constructor(options: ConfirmModalOptions) {
		this.options = options;
		this.modalContainer = document.createElement('div');
		const confirmButtonClass = options.invertConfirmAndCancelColors ? 'bg-red-700 hover:bg-red-800 active:bg-red-600' : 'bg-green-600 hover:bg-green-700 active:bg-green-500';
		const cancelButtonClass = options.invertConfirmAndCancelColors ? 'bg-gray-600 hover:bg-gray-700 active:bg-gray-500' : 'bg-red-600 hover:bg-red-700 active:bg-red-500';
		this.modalContainer.innerHTML = /*html*/`
			<div class="max-w-xl w-full max-h-screen flex flex-col bg-gray-800 text-white rounded-sm">
				<header class="flex px-4 py-3 text-2xl font-medium items-center">
					<span class="modal-title grow"></span>
					<button class="modal-close-button p-2 cursor-pointer text-xl"><i class="fa fa-times" aria-hidden="true"></i></button>
				</header>
				<div class="py-10 px-4">
					<span class="modal-message"></span>
				</div>
				<footer class="flex gap-1 justify-end items-center px-4 py-5">
					<button class="modal-confirm-button cursor-pointer px-2 py-1 text-xl ${confirmButtonClass} rounded-md"></button>
					<button class="modal-cancel-button cursor-pointer px-2 py-1 text-xl ${cancelButtonClass} rounded-md"></button>
				</footer>
			</div>
		`;

		this.modalContainer.className = `modal hidden w-dvw h-dvh flex flex-col justify-center items-center bg-black/50`;
		this.titleElement = document.createElement('h3');
		this.messageElement = document.createElement('p');
		this.confirmButtonElement = this.modalContainer.querySelector('.modal-confirm-button')!;
		this.cancelButtonElement = this.modalContainer.querySelector('.modal-cancel-button')!;

		this.titleElement.textContent = options.title;
		this.messageElement.textContent = options.message;

		if (!options.hideConfirmButton){
			this.confirmButtonElement.textContent = options.confirmButtonText ?? t('generic.confirm') ?? "Confirm";
			this.confirmButtonElement.addEventListener('click', this.onConfirmClick);
		} else {
			this.confirmButtonElement.classList.add('hidden');
		}
		if (!options.hideCancelButton) {
			this.cancelButtonElement.textContent = options.cancelButtonText ?? t('generic.cancel') ?? "Cancel";
			this.cancelButtonElement.addEventListener('click', this.onCancelClick);
		} else {
			this.cancelButtonElement.classList.add('hidden');
		}

		if (options.hideCloseButton) {
			this.modalContainer.querySelector('.modal-close-button')?.classList.add('hidden');
		} else {
			this.modalContainer.querySelector('.modal-close-button')?.addEventListener('click', this.onCancelClick);
		}
		this.modalContainer.querySelector('.modal-title')?.appendChild(this.titleElement);
		this.modalContainer.querySelector('.modal-message')?.appendChild(this.messageElement);
	}

	async show() {
		this.modalContainer.classList.remove('hidden');
		document.querySelector('#modal_container')?.appendChild(this.modalContainer);
		updateDOMTranslations(this.modalContainer);
	}

	destroy() {
		this.modalContainer.remove();
	}

	private onConfirmClick = this.#onConfirmClick.bind(this);
	#onCancelClick() {
		if (this.options.onCancel) {
			this.options.onCancel();
		}
		this.destroy();
	}

	private onCancelClick = this.#onCancelClick.bind(this);
	#onConfirmClick() {
		if (this.options.onConfirm) {
			this.options.onConfirm();
		}
		this.destroy();
	}

}
