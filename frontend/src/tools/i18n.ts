import i18next from 'i18next';
import { TranslationSchema, en } from '../translations/en';
import { it } from '../translations/it';
import { ua } from '../translations/ua';

export const CONSTANTS = {
	SELECTED_LANGUAGE_KEY: 'lang',
}

// DECLARATIONS OF THE LANGUAGES ----------------------------------------------
export enum AppLanguage {
	ENGLISH = 'en',
	ITALIAN = 'it',
	UKRAINIAN = 'ua',
}
export const defaultLanguage = AppLanguage.ENGLISH;

export const allLocales: AppLanguage[] = Object.keys(AppLanguage).map(key => AppLanguage[key as keyof typeof AppLanguage]);

export const allLanguagesDefinition: Record<AppLanguage, {nativeName: string, imageClass?: string}> = {
	[AppLanguage.ENGLISH]: { nativeName: 'English', imageClass: 'fi-us' },
	[AppLanguage.ITALIAN]: { nativeName: 'Italiano', imageClass: 'fi-it' },
	[AppLanguage.UKRAINIAN]: { nativeName: 'Українська', imageClass: 'fi-ua' },
}


const allTranslations: Record<AppLanguage, { translation: TranslationSchema }> = {
	it: { translation: it },
	en: { translation: en },
	ua: { translation: ua },
}

//------------------------------------------------------------------------------
// FUNCTIONS TO INITIALIZE I18N -----------------------------------------------

export async function initI18n(lang: AppLanguage | null = null) {
	if (!lang) {
		lang = getPreferedLanguage();
	}
	await i18next.init({
		lng: lang,
		fallbackLng: defaultLanguage,
		resources: {
			...Object.entries(allTranslations).map(([lang, translation]) => ({
				[lang]: translation,
			})).reduce((acc, curr) => ({ ...acc, ...curr }), {}),
		}
	})
}


/**
 * Changes the language of the application.
 * @param lang The language to change to.
 */
export const setLanguage = (lang: AppLanguage) => {
	i18next.changeLanguage(lang);
	localStorage.setItem(CONSTANTS.SELECTED_LANGUAGE_KEY, lang);

	window.router.updateCurrentControllerTitle();
	updateDOMTranslations();
}

export const rawT = i18next.t.bind(i18next);

export function getPreferedLanguage() {
	let result = navigator.languages ? navigator.languages[0] : navigator.language;
	console.debug('Browser language detected:', result);

	let cachedSelectedLanguage = localStorage.getItem(CONSTANTS.SELECTED_LANGUAGE_KEY);
	if (cachedSelectedLanguage) {
		console.debug('Using cached language:', cachedSelectedLanguage);
		result = cachedSelectedLanguage;
	} else {
		console.debug('No cached language found. Using browser language:', result);
	}

	if (allLocales.includes(result as any)){
		return result as AppLanguage;
	}

	console.debug('Browser language is not supported. Using default language:', defaultLanguage);
	return defaultLanguage;
}

//------------------------------------------------------------------------------


type DotNotation<T> = {
	// @ts-ignore
	[K in keyof T]: T[K] extends string ? K : `${K & string}.${DotNotation<T[K]> extends infer R ? R : never}`
}[keyof T];


export type LanguageKeys = DotNotation<TranslationSchema>;

/**
 * Utility function to write a translation key in a type-safe way.
 *
Example:
```
const key = k('hello.world'); // (the intellisense would provide the autocomplete for the key)
// key is now 'hello.world'
```

Example 2:
```
async render() {
	return `
	<div data-i18n="${k('hello.world')}">Hello World</div>
`;
```
 * }
 * @param key The key to write in a type-safe way.
 * @returns The key written in a type-safe way.
 */
export const k = <K extends LanguageKeys>(key: K) => {
	return key;
}

/**
 * Translates a key using i18next. This function is a wrapper around i18next.t with some additional features:
 * - Type-safe translation keys (e.g., if you call t('hello.world'), it will return the translation for the key 'hello.world') with the currently set language
 * - Support for nested keys (e.g., the template is {hello: {world: "hello world"}}, if you call t('hello.world'), it will return "hello world")
 * - Support for interpolation (e.g., the template is {hello: "hello {{name}}"}, if you call t('hello', { name: 'Sasha' }), it will return "hello Sasha")
 *
 * @param key The key of the translation to get. This can be a nested key (e.g., 'hello.world') or a simple key (e.g., 'hello').
 * @param options The options to pass to i18next.t. This can be used to interpolate the translation.
 * @returns The translation for the given key.
 */
export const t = <K extends LanguageKeys>(key: K, options?: Record<string, any>) => {
	const translation = rawT(key, options);
	if (translation !== key) {
		return translation;
	}
	console.warn(`Translation for key '${key}' not found. returning null.`);
	return null;
}

export function updateDOMTranslations(container: HTMLElement | Document = document) {
	container.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
		const key = el.getAttribute('data-i18n');
		if (!key) return;
		const varsAttr = el.getAttribute('data-i18n-vars');
		let vars = {};
		if (varsAttr) {
			try {
				vars = JSON.parse(varsAttr);
			} catch (error) {
				console.warn('Error parsing vars for i18n element', el, error);
			}
		}
		const translation = i18next.t(key, vars);
		if (translation === key) {
			console.warn(`Translation for key '${key}' not found. Falling to the textContent of the element.`);
		} else {
			el.innerHTML = translation;
		}
	});

}
