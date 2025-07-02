import {LayoutController} from "../types/pages";
import {AUTH_DOM_IDS, authManager} from "../tools/AuthManager";
import { CONSTANTS } from "../pages/_router";

export class BaseLayout extends LayoutController {
	#userMenuContainer: HTMLElement | null = null;
	#userMenuButton: HTMLElement | null = null;

	async render() {
		const isLoggedIn = await authManager.isUserLoggedIn();

		let userMenuButtons: string = '';
		if (isLoggedIn) {
			userMenuButtons =  /*html*/`
				<div class="cursor-pointer hover:text-emerald-400">
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
			<a onclick="window.authManager.login()" class="hover:text-emerald-400">
				<i class="fa fa-sign-in"></i>
				Login
			</a>
			`;
		}

		return /*html*/`
			<div class="flex flex-col w-full text-white grow bg-neutral-900">
				<div id="${CONSTANTS.APP_LAYOUT_CONTENT_ID}" class="flex flex-col w-full grow"></div>

				<footer class="grid items-center h-20 grid-cols-5 shadow-xl bg-neutral-950">
					<div class="flex items-center col-span-1 gap-2 font-mono font-bold">
						<button data-route="/home" class="route-link">
							<i class="fa fa-2x fa-home" aria-hidden="true"></i>
							<div class="hidden uppercase sm:flex">HOME</div>
						</button>

					</div>

					<div class="flex items-center justify-center col-span-3 gap-2 font-mono font-bold">
						<button data-route="/play" class="route-link">
							<i class="fa fa-2x fa-gamepad" aria-hidden="true"></i>
							<div class="hidden uppercase sm:flex">PLAY</div>
						</button>
					</div>

					<div class="relative flex items-center justify-end col-span-1 text-xl">
						<div id="${AUTH_DOM_IDS.userMenuButton}" class="flex items-center w-10 h-10 mx-4 cursor-pointer shrink-0">
							${isLoggedIn
								? /*html*/`<img src="${authManager.userImageUrl}" alt="Logged in user image" class="w-10 h-10 rounded-full">`
								: /*html*/`<i class="fa fa-2x fa-user-circle hover:text-emerald-100"></i>`
							}
						</div>

						<div id="${AUTH_DOM_IDS.userMenuContainer}" class="absolute right-0 items-center hidden w-40 px-3 py-1 text-base bg-black rounded bottom-full">
							<div class="flex flex-col w-full gap-1 select-none">
								${isLoggedIn
									? /*html*/`
										<h3 class="text-center">${authManager.user?.username}</h3>
										<hr class="text-white/10"/>
									`
									: ''
								}

								${userMenuButtons}
							</div>
							<!-- triangle at bottom right of the div -->
							<div class="absolute top-full right-[18px] w-0 h-0 border-l-[10px] border-l-transparent border-t-[10px] border-t-black border-r-[10px] border-r-transparent"></div>
						</div>
					</div>
				</footer>
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
			authManager.login();
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
