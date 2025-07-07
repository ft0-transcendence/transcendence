import {LayoutController} from "../types/pages";
import {AUTH_DOM_IDS, authManager} from "../tools/AuthManager";
import { CONSTANTS } from "../pages/_router";

export class BaseLayout extends LayoutController {
	#userMenuContainer: HTMLElement | null = null;
	#userMenuButton: HTMLElement | null = null;

	async render() {
		const isLoggedIn = await authManager.isUserLoggedIn();

		return /*html*/`
			<div class="flex flex-col w-full text-white grow bg-neutral-900">
				<div id="${CONSTANTS.APP_LAYOUT_CONTENT_ID}" class="flex flex-col w-full grow"></div>

				<footer class="grid items-center h-20 grid-cols-5 shadow-xl bg-neutral-950">
					<div class="flex items-center col-span-1 gap-2 font-mono font-bold h-full">
						<button data-route="/home" class="route-link nav-route h-full">
							<i class="fa !text-xl sm:!text-2xl fa-home" aria-hidden="true"></i>
							<div class="hidden uppercase sm:flex">HOME</div>
						</button>

					</div>

					<div class="flex items-center justify-center col-span-3 gap-2 font-mono font-bold h-full">
						<button data-route="/play" class="route-link nav-route h-full">
							<i class="fa !text-xl sm:!text-2xl fa-gamepad" aria-hidden="true"></i>
							<div class="hidden uppercase sm:flex">VS GAME</div>
						</button>
						<button data-route="/tournaments" class="route-link nav-route h-full">
							<i class="fa !text-xl sm:!text-2xl fa-users" aria-hidden="true"></i>
							<div class="hidden uppercase sm:flex">TOURNAMENTS</div>
						</button>
					</div>

					<div class="relative flex items-center justify-end gap-2 col-span-1 h-full">
						<button id="${AUTH_DOM_IDS.userMenuButton}" class="cursor-pointer fake-route-link nav-route h-full">
							${isLoggedIn
								? /*html*/`<img src="${authManager.userImageUrl}" alt="Logged in user image" class=" rounded-full object-scale-down h-8 w-8">
											<div class="hidden sm:flex text-nowrap">
											${authManager.user?.username}
										</div>`
								: /*html*/`<i class="fa !text-xl sm:!text-2xl fa-user-circle hover:text-emerald-100"></i>
									<div class="hidden uppercase sm:flex">Login</div>`
							}
						</button>

						<div id="${AUTH_DOM_IDS.userMenuContainer}" class="absolute right-0 items-center hidden w-40 px-3 py-2 text-base bg-black rounded bottom-full">
							<div class="flex flex-col w-full gap-4 select-none ">
								${isLoggedIn
							? /*html*/`
									<div data-route="/settings" class="cursor-pointer hover:text-emerald-400 route-link no-hover-bg !flex-row !justify-start">
										<i class="fa fa-cog"></i>
										Settings
									</div>
									<a href="/api/auth/logout" class="hover:text-emerald-400">
										<i class="fa fa-sign-out"></i>
										Logout
									</a>
									`
							:  /*html*/`
									<a onclick="window.authManager.login()" class="hover:text-emerald-400">
										<i class="fa fa-sign-in"></i>
										Login
									</a>
									`
							}
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
