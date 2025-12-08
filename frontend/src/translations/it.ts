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
		incoming_friend_requests: 'Richieste di amicizia in arrivo',
		friend_requests: 'Richieste di amicizia',
		no_friend_requests: 'Nessuna richiesta di amicizia',
		remove_friend: 'Rimuovi amico',
		remove_friend_confirm: 'Sei sicuro di voler rimuovere {{username}} dalla tua lista di amici? Questa azione non può essere annullata.',
		confirm: 'Conferma',
		cancel: 'Annulla',
		remove_friend_success: 'Amico rimosso con successo',
		hide: 'Nascondi',
		show: 'Mostra',
		sent_friend_requests: 'Richieste di amicizia inviate',
		cancel_friend_request: 'Annulla richiesta di amicizia',
		cancel_friend_request_confirm: 'Sei sicuro di voler annullare questa richiesta di amicizia dalla tua lista di amici? Questa azione non può essere annullata.',
		wins: 'Vittorie',
		losses: 'Perdite',
		tournaments_won: 'Tornei vinti',
		played_games: 'Partite giocate',
		win_rate: '% Di vittoria',
		tournaments: 'Tornei',
		join_tournament: 'Partecipa al torneo',
		create_tournament: 'Crea torneo',
		tournament_name: 'Nome del torneo',
		start_date_and_time: 'Data e ora di inizio',
		max_participants: 'Partecipanti massimi',
		tournament_name_placeholder: 'nome torneo',
		countdown: {
			hours_minutes: 'tra {{hours}}h {{minutes}}m',
			minutes_seconds: 'tra {{minutes}}m {{seconds}}s',
			started: '...',
		},
		already_joined_troll_description: "Bene, che è stato un buon tentativo, ma sei già nel torneo. Non puoi entrare due volte.",
		already_left_troll_description: "Bene, che è stato un buon tentativo, ma sei già uscito dal torneo. Non puoi lasciare ciò a cui non sei registrato.",
		leave_tournament: "Lascia Torneo",
		start_tournament: "Inizia Torneo",
		delete_tournament: "Elimina Torneo",
		tournamentList: {
			join: "Partecipa",
			leave: "Lascia",
			registered: "Registrato",
		},
		leave_tournament_success: "Sei uscito dal torneo",
		start_tournament_success: "Torneo iniziato con successo",
		delete_tournament_success: "Torneo eliminato con successo",
		delete_tournament_confirm: "Sei sicuro di voler eliminare questo torneo? Questa azione non può essere annullata.",
		create: "Crea",
		tournament: "Torneo",
		tournament_not_found: "Torneo non trovato",
		back_to_list: "Torna alla lista",
		join_tournament_success: "Ti sei unito al torneo con successo",
		by_user: "di {{user}}",
		winner: "Vincitore",
		games: "Partite",
		no_games_yet: "Nessuna partita ancora",
		vs: "vs",
		score_goal: "Punteggio per vincere",
		participants: "Partecipanti",
		tbd: "TBD",
		finished: "Finito",
		aborted: "Interrotto",
		pending: "In attesa",
		game_not_found: "Partita non trovata",
		game: "Partita",
		seconds: "secondi",
	},
	tournament:{
		bracket: "Programma",
		quarterfinals: "Quarti di finale",
		semifinals: "Semifinali",
		final: "Finale",
	},

	error: {
		generic_server_error: 'Qualcosa è andato storto. Per favore riprova più tardi.',
	},
	game: {
		player_disconnected: 'Giocatore {{playerName}} si è disconnesso',
		time_left_before_forfeit: 'Vittoria a tavolino in {{timeLeftMs}} secondi',
		aborted: {
			user_not_reconnected: 'Partita terminata perché {{username}} non si è riconnesso in tempo',
			generic: 'Partita terminata'
		},
		game_finished: 'Partita finita',
		waiting_other_player: `In attesa che l'altro giocatore si unisca...`,
		score_goal: 'Primo che arriva a {{score_goal}} vince!',
		movement_instructions: 'Per muoverti usando <b>W</b> - <b>S</b> o <b>↑</b> - <b>↓</b>',
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
		online_tournaments: 'Tornei online',
	},
	play: {
		enter_your_username: 'Inserisci il tuo nome utente',
		start_game: 'Inizia la partita',
		enter_players_usernames: 'Inserisci i nomi utente dei giocatori',
		left_player_input_label: 'Giocatore sinistro (tasti W, S)',
		right_player_input_label: 'Giocatore destro (tasti ↑, ↓)',
		right_player_input_placeholder: 'giocatore destro',
		left_player_input_placeholder: 'giocatore sinistro',
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
				"tournament_game": 'Partita torneo - online',
			},
			offline: {
				"1vAI": '1 vs IA - offline',
				"1v1": '1 vs 1 - offline',
				"tournaments": 'Tornei - offline',
			}
		}
	},
	page: {
		play: {
			online: {
				"1v1": {
					matchmaking: {
						redirecting_in: "Reindirizzamento in",
						already_started: "La partita è già iniziata",
						reconnect_now: "Riconnetti ora",
					}
				}
			},
		},
	}
}
