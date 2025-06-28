import {LayoutController} from "../types/pages";
import {AUTH_DOM_IDS, authManager} from "../tools/AuthManager";

export class BaseLayout extends LayoutController {
	#userMenuContainer: HTMLElement | null = null;
	#userMenuButton: HTMLElement | null = null;

	async render() {
		const isLoggedIn = await authManager.isUserLoggedIn();

		let userMenuButtons: string = '';
		if (isLoggedIn && authManager.user) {
			userMenuButtons =  /*html*/`
				<div class="hover:text-emerald-400 cursor-pointer">
					<i class="fa fa-cog"></i>
					Settings
				</div>
				<a href="/api/auth/logout" class="hover:text-emerald-400">
					<i class="fa fa-sign-out"></i>
					Logout
				</a>
			`;
		} else {
			userMenuButtons =  /*html*/`
			<a href="/api/auth/login/google" class="hover:text-emerald-400">
				<i class="fa fa-sign-in"></i>
				Login
			</a>
			`;
		}

		return /*html*/`
			<div class="flex flex-col grow w-full bg-neutral-900 text-white">
				<header class="flex items-center h-20 px-4 shadow-xl bg-neutral-950">
					<div class="grow"></div>
					<div class="text-xl relative">
						<div id="${AUTH_DOM_IDS.userMenuButton}" class="flex items-center p-2 cursor-pointer ">
							${isLoggedIn && authManager.user
								? /*html*/`<img src="${authManager.userImageUrl}" alt="Logged in user image" class="rounded-full w-10 h-10">`
								: /*html*/`<i class="fa fa-2x fa-user-circle hover:text-emerald-100"></i>`
							}
						</div>

						<div id="${AUTH_DOM_IDS.userMenuContainer}" class="absolute top-full right-0 hidden w-40 bg-black rounded px-3 py-1 text-base items-center">
							<div class="flex flex-col gap-1 w-full select-none">
								${isLoggedIn
									? /*html*/`
										<h3 class="text-center">${authManager.user?.username}</h3>
										<hr class="text-white/10"/>
									`
									: ''
								}

								${userMenuButtons}
							</div>
						</div>
					</div>
				</header>
				<div id="app_layout_content" class="flex grow flex-col w-full"></div>
			</div>`;
	}

	async postRender() {
		console.log('Base layout loaded');
		this.#userMenuButton = document.getElementById(AUTH_DOM_IDS.userMenuButton);
		this.#userMenuContainer = document.getElementById(AUTH_DOM_IDS.userMenuContainer);


		this.#userMenuButton?.addEventListener('click', this.onMenuButtonClick.bind(this));
		window.addEventListener('click', this.onWindowClick.bind(this));
	}

	async destroy() {
		this.#userMenuButton?.removeEventListener('click', this.onMenuButtonClick.bind(this));
		window.removeEventListener('click', this.onWindowClick.bind(this));
	}


	onMenuButtonClick() {
		console.debug('User menu button clicked');

		if (authManager.user) {
			this.#toggleUserMenu();
		} else {
			window.location.href = '/api/auth/login/google';
		}
	}

	onWindowClick(event: MouseEvent) {
		if (!this.#userMenuContainer?.contains(event.target as Node) && !this.#userMenuButton?.contains(event.target as Node)) {
			this.#toggleUserMenu(false);
		}
	}

	#toggleUserMenu(visible?: boolean) {
		if (visible !== undefined) {
			this.#userMenuContainer?.classList.toggle('hidden', !visible);
			this.#userMenuContainer?.classList.toggle('flex', visible);
			return;
		} else {
			this.#userMenuContainer?.classList.toggle('hidden');
			this.#userMenuContainer?.classList.toggle('flex');
		}
	}
}
