import i18next from 'i18next';
import { allLanguagesDefinition, allLocales, AppLanguage, setLanguage } from '@tools/i18n';
import toast from '@tools/Toast';
import { ComponentController } from '@tools/ViewController';

export class LanguageSelectorComponent extends ComponentController {
	#langSelectorTrigger: HTMLElement | null = null;
	#langSelectorDropdown: HTMLElement | null = null;

	#langSelectorClickHandler = this.#onLangSelectorClick.bind(this);
	#langOutsideClickHandler = this.#onLangOutsideClick.bind(this);
	#langItemHandlers: (() => void)[] = [];


	constructor() {
		super();
	}

	async render() {
		return /*html*/`
		<div class="relative w-full hover:bg-amber-950/5">
			<!-- Trigger Button -->
			<button id="language-selector" type="button" aria-haspopup="true" aria-expanded="false"
				class="inline-flex items-center cursor-pointer w-full gap-2 border border-white/20 px-4 py-2 text-sm font-medium text-white uppercase">
				<span id="selected-language-icon" class="fi fis ${allLanguagesDefinition[AppLanguage.ENGLISH].imageClass}"></span>
				<span id="selected-language-name">${allLanguagesDefinition[AppLanguage.ENGLISH].nativeName}</span>
			</button>

			<!-- Dropdown Menu -->
			<div id="language-dropdown"
				class="hidden absolute bottom-full z-50 w-full border-l border-r rounded-t-md border-t border-white/25 origin-bottom-right bg-neutral-950 shadow-lg focus:outline-none">
				<ul class="">
					${allLocales.map(lang => /*html*/`
						<li data-lang="${lang}" class="flex items-center gap-2 px-4 py-2 hover:bg-white/10 cursor-pointer">
							<span class="fi fis ${allLanguagesDefinition[lang].imageClass}"></span>
							<span>${allLanguagesDefinition[lang].nativeName}</span>
						</li>
					`).join('')}
				</ul>
			</div>
		</div>
		`;
	}
	async postRender() {
		this.#setupLanguageSelector();



		const selectedIcon = document.getElementById('selected-language-icon');
		const selectedName = document.getElementById('selected-language-name');

		if (selectedIcon && selectedName) {
			const currentLang = i18next.language as AppLanguage;
			selectedIcon.className = `fi fis ${allLanguagesDefinition[currentLang]?.imageClass}`;
			selectedName.textContent = allLanguagesDefinition[currentLang]?.nativeName;
		} else {
			toast.warn('Language selector', 'Could not find the elements with the IDs "selected-language-icon" and "selected-language-name".<br/>What happened?');
		}
	}

	async destroy() {
		// Language selector events
		this.#langSelectorTrigger?.removeEventListener('click', this.#langSelectorClickHandler);
		window.removeEventListener('click', this.#langOutsideClickHandler);

		// Remove item click listeners
		this.#langItemHandlers.forEach(unbind => unbind());
		this.#langItemHandlers = [];
	}


	#setupLanguageSelector() {
		this.#langSelectorTrigger = document.getElementById('language-selector');
		this.#langSelectorDropdown = document.getElementById('language-dropdown');

		const selectedIcon = document.getElementById('selected-language-icon');
		const selectedName = document.getElementById('selected-language-name');

		if (!this.#langSelectorTrigger || !this.#langSelectorDropdown || !selectedIcon || !selectedName) return;

		// Toggle on trigger click
		this.#langSelectorTrigger.addEventListener('click', this.#langSelectorClickHandler);

		// Outside click to close
		window.addEventListener('click', this.#langOutsideClickHandler);

		// Language selection
		this.#langItemHandlers = [];
		this.#langSelectorDropdown.querySelectorAll('li[data-lang]')
			.forEach(li => {
				const handler = () => {
					const lang = li.getAttribute('data-lang') as AppLanguage;
					if (!lang) return;

					selectedIcon.className = `fi fis ${allLanguagesDefinition[lang].imageClass}`;
					selectedName.textContent = allLanguagesDefinition[lang].nativeName;

					setLanguage(lang);
					this.#langSelectorDropdown?.classList.add('hidden');
				};

				li.addEventListener('click', handler);

				// Store unbind function
				this.#langItemHandlers.push(() => li.removeEventListener('click', handler));
			});
	}

	#onLangSelectorClick(e: MouseEvent) {
		e.stopPropagation();
		this.#langSelectorDropdown?.classList.toggle('hidden');
	}

	#onLangOutsideClick(e: MouseEvent) {
		if (!this.#langSelectorDropdown || !this.#langSelectorTrigger) return;
		if (!this.#langSelectorDropdown.contains(e.target as Node) &&
			!this.#langSelectorTrigger.contains(e.target as Node)) {
			this.#langSelectorDropdown.classList.add('hidden');
		}
	}
}
