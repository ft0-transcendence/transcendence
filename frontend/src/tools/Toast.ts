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
		onClose: () => {},
	}

	constructor() {
		const container = document.getElementById('toast_container');
		if (!container) {
			this.#container = document.createElement('div');
			this.#container.id = 'toast_container';
			this.#container.className = 'fixed top-4 right-4 flex flex-col gap-2 z-[9999] sm:right-4 sm:top-4';
			document.body.appendChild(this.#container);
		} else {
			this.#container = container;
		}
	}

	public success(title: string | null, message: string, options?: ToastOptions) {
		return this.createToast('success', title, message, options);
	}
	public info(title: string | null, message: string, options?: ToastOptions) {
		return this.createToast('info', title, message, options);
	}
	public error(title: string | null, message: string, options?: ToastOptions) {
		return this.createToast('error', title, message, options);
	}
	public warn(title: string | null, message: string, options?: ToastOptions) {
		return this.createToast('warn', title, message, options);
	}

	private createToast(type: 'success' | 'error' | 'info' | 'warn', title: string | null, message: string, options?: ToastOptions) {
		const toast = document.createElement('div');

		// Base glassy style + type colors
		toast.className = `
			w-full sm:w-80 px-4 py-3 rounded-xl shadow-lg relative overflow-hidden
			backdrop-blur-md border flex flex-col gap-2 transition-all duration-200
			${this.#getBgColorClass(type)} ${this.#getBorderColorClass(type)} ${this.#getTextColorClass(type)}
		`;

		toast.innerHTML = `
			<div class="flex items-center gap-2 mb-1">
				<div class="toast-icon ${options?.titleIcon || ''}"></div>
				<div class="toast-title font-semibold text-sm sm:text-base">${title ?? ''}</div>
				<button class="ml-auto text-xl font-bold cursor-pointer close_toast" aria-label="Close">&times;</button>
			</div>
			<div class="text-xs sm:text-sm break-words">${message}</div>
			<div class="toast_timeout_progress h-1 w-full absolute bottom-0 left-0 rounded-b-lg bg-white/30"></div>
		`;

		// Close button
		toast.querySelector('button.close_toast')?.addEventListener('click', () => this.#close(toast));

		// Swipe-to-dismiss
		let startX: number | null = null;
		toast.addEventListener('touchstart', (e) => startX = e.touches[0].clientX);
		toast.addEventListener('touchmove', (e) => {
			if (startX === null) return;
			const deltaX = e.touches[0].clientX - startX;
			toast.style.transform = `translateX(${deltaX}px)`;
			toast.style.opacity = `${Math.max(0, 1 - Math.abs(deltaX) / 150)}`;
		});
		toast.addEventListener('touchend', (e) => {
			if (startX === null) return;
			const deltaX = e.changedTouches[0].clientX - startX;
			if (Math.abs(deltaX) > 100) this.#close(toast);
			else {
				toast.style.transform = '';
				toast.style.opacity = '1';
			}
			startX = null;
		});

		this.#toasts.push(toast);
		this.#container.appendChild(toast);

		// Progress and auto-close
		const timeout = options?.duration ?? this.defaultOptions.duration;
		if (timeout && !options?.preventClose) {
			const progressBar = toast.querySelector('.toast_timeout_progress') as HTMLElement;
			const endTime = Date.now() + timeout;

			const updateProgress = () => {
				const remainingTime = endTime - Date.now();
				progressBar.style.width = `${Math.max(0, remainingTime * 100 / timeout)}%`;
				if (remainingTime > 0) requestAnimationFrame(updateProgress);
				else this.#close(toast);
			}
			updateProgress();

			setTimeout(() => this.#close(toast), timeout);
		}
	}

	#getBgColorClass(type: string) {
		switch (type) {
			case 'success': return 'bg-green-600/25';
			case 'error': return 'bg-red-600/25';
			case 'info': return 'bg-blue-600/25';
			case 'warn': return 'bg-yellow-500/25';
			default: return 'bg-neutral-800/25';
		}
	}
	#getBorderColorClass(type: string) {
		switch (type) {
			case 'success': return 'border-green-600/50';
			case 'error': return 'border-red-600/50';
			case 'info': return 'border-blue-600/50';
			case 'warn': return 'border-yellow-400/50';
			default: return 'border-white/30';
		}
	}
	#getTextColorClass(type: string) {
		return 'text-white';
	}

	#close(toast: HTMLElement) {
		toast.classList.add('opacity-0', 'scale-95');
		setTimeout(() => {
			toast.remove();
			this.#toasts = this.#toasts.filter(t => t !== toast);
			this.defaultOptions.onClose?.();
		}, 200);
	}
}

export const toast = new Toast();
window.toast = toast;
export default toast;
