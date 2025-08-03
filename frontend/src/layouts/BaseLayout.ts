import { LayoutController } from "../types/pages";
import { AUTH_DOM_IDS, authManager } from "../tools/AuthManager";
import { CONSTANTS } from "../pages/_router";
import { k } from "../tools/i18n";
import { LanguageSelectorComponent } from '../components/LanguageSelector';

export class BaseLayout extends LayoutController {
	#userMenuContainer: HTMLElement | null = null;
	#userMenuButton: HTMLElement | null = null;

	async preRender(){

	}

	async render() {
		const isLoggedIn = await authManager.isUserLoggedIn();


		return /*html*/`
			<div class="flex flex-col w-full text-white grow bg-neutral-900">
				<div id="${CONSTANTS.APP_LAYOUT_CONTENT_ID}" class="flex flex-col w-full grow"></div>

				<footer class="grid items-center h-20 grid-cols-5 shadow-xl bg-neutral-950">
					<div class="flex items-center col-span-1 gap-2 font-mono font-bold h-full">
						<button data-route="/home" class="route-link nav-route h-full">
							<i class="fa !text-xl sm:!text-2xl fa-home" aria-hidden="true"></i>
							<div class="hidden uppercase sm:flex" data-i18n="${k("navbar.homepage")}">HOME</div>
						</button>

					</div>

					<div class="flex items-center justify-center col-span-3 gap-2 font-mono font-bold h-full">
						${isLoggedIn
							? /*html*/`
								<button data-route="/match" class="route-link nav-route h-full">
									<i class="fa !text-xl sm:!text-2xl fa-gamepad" aria-hidden="true"></i>
									<div class="hidden uppercase sm:flex" data-i18n="${k("navbar.online_game")}">VS GAME</div>
								</button>
								<button data-route="/tournaments" class="route-link nav-route h-full">
									<i class="fa !text-xl sm:!text-2xl fa-users" aria-hidden="true"></i>
									<div class="hidden uppercase sm:flex" data-i18n="${k("navbar.tournaments")}">TOURNAMENTS</div>
								</button>
							`
							: /*html*/`
								<button data-route="/home" class="route-link nav-route h-full">
									<i class="fa !text-xl sm:!text-2xl fa-gamepad" aria-hidden="true"></i>
									<div class="hidden uppercase sm:flex" data-i18n="${k("navbar.start_here")}">START HERE</div>
								</button>
							`
						}

					</div>

					<div class="relative flex items-center justify-end gap-2 col-span-1 h-full">
						<button id="${AUTH_DOM_IDS.userMenuButton}" class="cursor-pointer fake-route-link nav-route h-full">
							<i class="fa !text-xl sm:!text-2xl fas fa-bars"></i>
							<div class="hidden uppercase sm:flex" data-i18n="${k("navbar.menu")}">Menu</div>
						</button>

						<div id="${AUTH_DOM_IDS.userMenuContainer}" class="absolute items-center hidden w-48 px-3 py-2 text-base bg-black rounded bottom-full">
							<div class="flex flex-col w-full select-none ">
								${isLoggedIn
									? /*html*/`
										<div class="flex gap-1 items-center justify-center flex-col">
											<img src="${authManager.userImageUrl}" alt="Logged in user image" class=" rounded-full object-scale-down h-8 w-8">
											<div class="text-xs italic text-white/50">
												${authManager.user?.username}
											</div>
										</div>
										<div class="horiz-divider"></div>
									`
									: ``
								}
								<div class="px-1 ${isLoggedIn ? 'pb-4' : ''}  pt-2 flex flex-col text-sm">
									${isLoggedIn
										? /*html*/`
											<div data-route="/settings" class="cursor-pointer w-full hover:text-emerald-400 route-link no-hover-bg py-1 !flex-row !justify-start !gap-0">
												<span class="grow text-left font-semibold" data-i18n="${k("navbar.settings")}">Settings</span>
													<i class="fa fa-cog"></i>
											</div>
											<a href="/api/auth/logout" class="hover:text-emerald-400 fake-route-link no-hover-bg py-1 !flex-row !justify-start !gap-0 w-full">
												<span class="grow text-left font-semibold" data-i18n="${k("navbar.logout")}">Logout</span>
													<i class="fa fa-sign-out"></i>
											</a>
											`
										:  /*html*/`
											<div onclick="window.authManager.login()" class="hover:text-emerald-400 fake-route-link  no-hover-bg py-1 !flex-row !justify-start !gap-0">
												<span class="grow text-left font-semibold" data-i18n="${k("navbar.login")}">Login</span>
													<i class="fa fa-sign-in"></i>
											</button>
											`
									}
								</div>


								<!-- language selector -->
								${await this.registerChildComponent(new LanguageSelectorComponent()).silentRender()}

							</div>
							<!-- triangle at bottom right of the div -->
							<div class="absolute top-full right-11 bottom-0 w-0 h-0 border-l-[20px] border-l-transparent border-t-[20px] border-t-black border-r-[20px] border-r-transparent"></div>
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
		// User menu events
		this.#userMenuButton?.removeEventListener('click', this.onMenuButtonClick.bind(this));
		window.removeEventListener('click', this.onWindowClick.bind(this));
	}

	onMenuButtonClick() {
		console.debug('User menu button clicked');
		this.#toggleUserMenu();
	}


	onWindowClick(event: MouseEvent) {
		if (!this.#userMenuContainer?.contains(event.target as Node) && !this.#userMenuButton?.contains(event.target as Node)) {
			this.#toggleUserMenu(false);
		}
	}

	#toggleUserMenu(visible?: boolean) {
		if (!this.#userMenuContainer) return;

		const shouldShow = visible ?? this.#userMenuContainer.classList.contains('hidden');

		this.#userMenuContainer.classList.toggle('hidden', !shouldShow);
		this.#userMenuContainer.classList.toggle('flex', shouldShow);
	}
}
