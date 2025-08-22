import { LayoutController } from "@tools/ViewController";
import { AUTH_DOM_IDS, authManager } from "@tools/AuthManager";
import { CONSTANTS } from "../pages/_router";
import { k } from "@tools/i18n";
import { LanguageSelectorComponent } from '../components/LanguageSelector';

export class BaseLayout extends LayoutController {
	#userMenuContainer: HTMLElement | null = null;
	#userMenuButton: HTMLElement | null = null;

	#fullscreenToggle: HTMLElement | null = null;

	async preRender() {

	}

	async render() {
		const isLoggedIn = await authManager.isUserLoggedIn();

		return /*html*/`
			<div class="flex flex-col w-full text-white grow bg-neutral-900 overflow-hidden">
				<div id="${CONSTANTS.APP_LAYOUT_CONTENT_ID}" class="flex flex-col w-full grow overflow-y-auto"></div>

				<footer class="grid items-center h-20 grid-cols-5 shadow-xl bg-neutral-950 py-0.5">
					<div class="flex items-center col-span-1 font-mono font-bold size-full">
						<button data-route="/${isLoggedIn ? 'home' : ''}" class="route-link nav-route size-full">
							<img src="/ft0-pong.png" alt="FT0 Transendence" class="object-scale-down h-12 aspect-square sm:w-7 sm:h-7">
							<div class="hidden uppercase sm:flex" style="line-height: 1rem;" data-i18n="${k("navbar.homepage")}">HOME</div>
						</button>
					</div>

					<div class="flex items-center justify-center col-span-3 font-mono font-bold size-full">
						<button data-route="/play" class="route-link nav-route size-full">
							<i class="fa !text-4xl sm:!text-2xl fa-gamepad" aria-hidden="true"></i>
							<div class="hidden uppercase sm:flex" data-i18n="${k("navbar.start_playing")}">START PLAYING</div>
						</button>
					</div>

					<div class="relative flex flex-col items-center justify-center col-span-1 size-full">
						<button id="${AUTH_DOM_IDS.userMenuButton}" class="cursor-pointer fake-route-link nav-route size-full">
							<i class="fa !text-4xl sm:!text-2xl fas fa-bars"></i>
							<div class="hidden uppercase sm:flex" data-i18n="${k("navbar.menu")}">Menu</div>
						</button>

						<div id="${AUTH_DOM_IDS.userMenuContainer}" class="absolute mb-2 right-0 items-center hidden w-56 px-3 py-2 text-base bg-black rounded bottom-full z-50">

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
								<div class="px-1 pt-2 pb-2 flex flex-col text-base">

									${isLoggedIn
				? /*html*/`
											<div data-route="/settings" class="cursor-pointer w-full hover:text-amber-400 route-link no-hover-bg py-1 !flex-row !justify-start !gap-0">
												<span class="grow text-left font-semibold" data-i18n="${k("navbar.settings")}">Settings</span>
													<i class="fa fa-cog"></i>
											</div>
											<a href="/api/auth/logout" class="hover:text-amber-400 fake-route-link no-hover-bg py-1 !flex-row !justify-start !gap-0 w-full">
												<span class="grow text-left font-semibold" data-i18n="${k("navbar.logout")}">Logout</span>
													<i class="fa fa-sign-out"></i>
											</a>
											`
				:  /*html*/`
											<div onclick="window.authManager.login()" class="hover:text-amber-400 fake-route-link  no-hover-bg py-1 !flex-row !justify-start !gap-0">
												<span class="grow text-left font-semibold" data-i18n="${k("navbar.login")}">Login</span>
													<i class="fa fa-sign-in"></i>
											</div>
											`
			}

								</div>

								<!-- REQUEST FULLSCREEN -->
								<div class="flex flex-col w-full select-none py-2 overflow-hidden">
									<div id="${this.id}-fullscreen-toggle" class="overflow-hidden hover:text-amber-400 fake-route-link no-hover-bg py-1 !flex-row !justify-start !gap-0">
										<div class="grow overflow-ellipsis text-left font-semibold line-clamp-1" data-i18n="${k("navbar.fullscreen_mode")}">Fullscreen mode</div>

										<i class="fullscreen-enable-icon fa fa-expand"></i>
										<i class="fullscreen-disable-icon fa fa-compress !hidden"></i>
									</div>
								</div>

								<!-- language selector -->
								${await this.registerChildComponent(new LanguageSelectorComponent()).silentRender()}

							</div>
							<!-- triangle at bottom right of the div
								<div class="absolute top-full right-0 bottom-0 w-0 h-0 border-l-[12px] border-l-transparent border-t-[12px] border-t-black border-r-[12px] border-r-transparent"></div>
							-->
						</div>
					</div>
				</footer>
			</div>`;
	}

	#onFullscreenToggleClickBind = this.#onFullscreenToggleClick.bind(this);
	#onMenuButtonClickBind = this.#onMenuButtonClick.bind(this);
	#onWindowClickBind = this.#onWindowClick.bind(this);

	async postRender() {
		console.log('Base layout loaded');

		this.#userMenuButton = document.getElementById(AUTH_DOM_IDS.userMenuButton);
		this.#userMenuContainer = document.getElementById(AUTH_DOM_IDS.userMenuContainer);

		this.#fullscreenToggle = document.getElementById(`${this.id}-fullscreen-toggle`);
		this.#fullscreenToggle?.addEventListener('click', this.#onFullscreenToggleClickBind);

		this.#userMenuButton?.addEventListener('click', this.#onMenuButtonClickBind);
		window.addEventListener('click', this.#onWindowClickBind);

		// this.#toggleUserMenu(true);
	}

	async destroy() {
		// User menu events
		this.#userMenuButton?.removeEventListener('click', this.#onMenuButtonClickBind);
		this.#fullscreenToggle?.removeEventListener('click', this.#onFullscreenToggleClickBind);

		window.removeEventListener('click', this.#onWindowClickBind);
	}

	#onFullscreenToggleClick() {
		console.debug('Fullscreen toggle button clicked');
		const docAsAny = document as any;

		const newState = !docAsAny.fullscreenElement && !docAsAny.webkitFullscreenElement;

		this.#fullscreenToggle?.querySelector('.fullscreen-disable-icon')?.classList.toggle('!hidden', !newState);
		this.#fullscreenToggle?.querySelector('.fullscreen-enable-icon')?.classList.toggle('!hidden', newState);


		if (!document.fullscreenElement &&
			!docAsAny.webkitFullscreenElement) {
			if (docAsAny.documentElement.requestFullscreen) {
				docAsAny.documentElement.requestFullscreen();
			} else if (docAsAny.documentElement.webkitRequestFullscreen) { // Safari
				docAsAny.documentElement.webkitRequestFullscreen();
			} else if (docAsAny.documentElement.msRequestFullscreen) { // IE/Edge
				docAsAny.documentElement.msRequestFullscreen();
			}
		} else {
			document.exitFullscreen();
		}
	}

	#onMenuButtonClick() {
		console.debug('User menu button clicked');
		this.#toggleUserMenu();
	}


	#onWindowClick(event: MouseEvent) {
		if (!this.#userMenuContainer?.contains(event.target as Node) && !this.#userMenuButton?.contains(event.target as Node)) {
			this.#toggleUserMenu(false);
		}
	}

	#toggleUserMenu(visible?: boolean) {
		if (!this.#userMenuContainer) return;

		const shouldShow = visible ?? this.#userMenuContainer.classList.contains('hidden');

		this.#userMenuContainer.classList.toggle('hidden', !shouldShow);
		this.#userMenuContainer.classList.toggle('flex', shouldShow);
		if (this.#userMenuButton) {
			this.#userMenuButton.classList.toggle('focused', shouldShow);
		}
	}
}
