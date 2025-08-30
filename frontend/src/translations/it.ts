import { TranslationSchema } from "./en";

/**
 * This is the Italian translation file.
 */
export const it: TranslationSchema = {
	generic:{
		or: 'Oppure',
		choose_game_mode: 'Scegli una modalità di gioco',
		online: 'ONLINE',
		offline: 'OFFLINE',
		online_mode_explanation: 'Gioca online, con un sistema di matchmaking e tracciamento delle partite.',
		offline_mode_explanation: 'Gioca sullo stesso computer, senza tracciare le partite.',
		online_mode_login_needed: 'Devi effettuare il login per giocare online.',
		go_back: 'Torna indietro',
	},
	game_modes: {
		ai: '1 vs IA',
		vs: '1 vs 1',
		tournament: 'Torneo',
	},
	landing_page: {
		description: 'Benvenuto nell\'esperienza classica di Pong! Sfida i tuoi amici o migliora le tue abilità in questo gioco di table tennis. Semplice da imparare, difficile da imparare.',
	},
	navbar: {
		menu: 'Menu',
		start_here: 'Inizia qui',
		login: 'Login',
		logout: 'Logout',
		settings: 'Impostazioni',
		profile: 'Profilo',
		language: 'Lingua',
		language_select: 'Seleziona la lingua',
		homepage: 'Pagina iniziale',
		online_game: 'Gioca online',
		tournaments: 'Tornei',
		start_playing: 'Inizia a giocare',
		fullscreen_mode: 'Schermo intero',
	},
}
