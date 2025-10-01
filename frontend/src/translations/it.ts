import { TranslationSchema } from "./en";

/**
 * This is the Italian translation file.
 */
export const it: TranslationSchema = {
	generic: {
		or: 'Oppure',
		choose_game_mode: 'Scegli una modalità di gioco',
		online: 'ONLINE',
		friends: 'Amici',
		offline: 'OFFLINE',
		online_mode_explanation: 'Gioca online, con un sistema di matchmaking e tracciamento delle partite.',
		offline_mode_explanation: 'Gioca sullo stesso computer, senza tracciare le partite.',
		online_mode_login_needed: 'Devi effettuare il login per giocare online.',
		go_back: 'Torna indietro',
		username: 'Nome utente',
		profile_picture: 'Immagine del profilo',
		add_friend: 'Aggiungi un amico',
		enter_username: "Username amico",
		sending_request: 'Invio richiesta...',
		friend_request_sent: 'Richiesta inviata!',
		friend_request_failed: 'Invio richiesta fallito',
		more_actions: 'Altre azioni',
		view_profile: 'Vedi profilo',
		send: 'Invia',
		currently_active_games: 'Giochi attualmente in corso',
		notifications: 'Notifiche',
		last_20_matches: 'Ultime 20 partite',
		loading: 'Caricamento...',
		no_matches: 'Nessuna partita trovata',
		no_games: 'Nessun gioco trovato',
		no_notifications: 'Nessuna notifica',
		accept_friend_request: 'Accetta',
		reject_friend_request: 'Rifiuta',
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
		landing_page: 'Pagina iniziale',
	},
	play: {
		enter_your_username: 'Inserisci il tuo nome utente',
		start_game: 'Inizia la partita',
		enter_players_usernames: 'Inserisci i nomi utente dei giocatori',
		left_player_input_label: 'Giocatore sinistro (tasti W, S)',
		right_player_input_label: 'Giocatore destro (tasti ↑, ↓)',
	},
	settings: {
		title: 'Impostazioni del profilo',
		profile_picture_instructions: 'Raccomandato: immagine quadrata, max 2.5MB',
		username_instructions: 'Il nome utente deve essere univoco e 3-24 caratteri. Sono ammessi solo lettere, numeri e underscore.',
		update: {
			username: {
				title: 'Aggiornamento nome utente',
				success: 'Nome utente aggiornato con successo',
			},
			avatar: {
				title: 'Aggiornamento avatar',
				success: 'Avatar aggiornato con successo',
			}
		}
	},


	page_titles: {
		play: {
			online: {
				"1v1_game": '1 vs 1 - partita online',
				"1v1_matchmaking": '1 vs 1 Matchmaking - online',
				"tournaments": 'Tornei - online',
			},
			offline: {
				"1vAI": '1 vs IA - offline',
				"1v1": '1 vs 1 - offline',
				"tournaments": 'Tornei - offline',
			}
		}
	}
}
