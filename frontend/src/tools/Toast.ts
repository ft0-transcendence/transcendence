import { userRouter } from '../../../backend/src/trpc/routes/user';
type ToastOptions = {
	duration?: number; // Duration in milliseconds
	onClose?: () => void;
	titleIcon?: string;
	preventClose?: boolean;
}

class Toast {
	#container: HTMLElement;
	#toasts: HTMLElement[] = [];

	private defaultOptions: ToastOptions = {
		duration: 5000,
		onClose: () => { },
	}


	constructor() {
		const container = document.getElementById('toast_container');
		if (!container) {
			console.debug('Toast container not found. Creating a new one...');
			this.#container = document.createElement('div');
			this.#container.id = 'toast_container';
			this.#container.className = 'fixed top-0 right-0 flex flex-col gap-2';
			document.body.appendChild(this.#container);
		}
		else {
			this.#container = container;
		}
	}

	public success(title: string, message: string, options?: ToastOptions) {
		return this.createToast('success', title, message, options);
	}
	public info(title: string, message: string, options?: ToastOptions) {
		return this.createToast('info', title, message, options);
	}

	public error(title: string, message: string, options?: ToastOptions) {
		return this.createToast('error', title, message, options);
	}
	public warn(title: string, message: string, options?: ToastOptions) {
		return this.createToast('warn', title, message, options);
	}

	private createToast(type: 'success' | 'error' | 'info' | 'warn', title: string, message: string, options?: ToastOptions) {
		const toast = document.createElement('div');
		toast.className = `last:mb-4 first:mt-4 mx-4 pt-2 pb-4 text-white rounded-lg shadow-lg bg-neutral-800 toast-${type} relative opacity-100 overflow-hidden`;
		toast.innerHTML = `
			<div class="px-4 toast-header  mb-2 gap-2 flex items-center border-b border-b-white/20">
				<div class="toast-icon ${options?.titleIcon || ''}"></div>
				<div class="toast-title text-base font-semibold">${title}</div>
				<button class="close_toast absolute top-1 right-3 text-2xl font-semibold cursor-pointer" aria-label="Close">&times;</button>
			</div>
			<div class="text-sm px-4 overflow-hidden text-ellipsis">
				${message}
			</div>
			<div class="toast_timeout_progress bg-black h-1 w-full absolute bottom-0 left-0 opacity-50"></div>
		`;
		toast.querySelector('button.close_toast')?.addEventListener('click', () => {
			this.close(toast);
		});
		this.#toasts.push(toast);
		this.#container.appendChild(toast);

		const timeout = options ? options?.duration : this.defaultOptions.duration;

		if (timeout && timeout >= 0 && !(options ? options.preventClose : this.defaultOptions.preventClose)) {
			const progressBar = toast.querySelector('.toast_timeout_progress') as HTMLElement;
			const endTime = Date.now() + timeout;

			const updateProgress = () => {
				const remainingTime = endTime - Date.now();
				const percentage = Math.max(0, remainingTime * 100 / timeout);
				progressBar.style.width = `${percentage}%`;
				if (remainingTime <= 0) {
					this.close(toast);
				} else {
					requestAnimationFrame(updateProgress);
				}
			}
			updateProgress();

			setTimeout(() => {
				this.close(toast);
			}, timeout);
		}
	}

	private close(toast: HTMLElement) {
		toast.classList.add('fade-out');
		setTimeout(() => {
			toast.remove();
			this.#toasts = this.#toasts.filter(t => t !== toast);
			if (this.defaultOptions.onClose) {
				this.defaultOptions.onClose();
			}
		}, 250); // Match the fade-out duration in CSS
	}

}

export const toast = new Toast();
window.toast = toast;

export default toast;
